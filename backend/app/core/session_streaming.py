"""
Voice Session with Streaming Support and Audio Metrics
"""
import base64
import logging
import time
import io
import uuid
from typing import Optional, List, Union
from fastapi import WebSocket
from pydub import AudioSegment
from app.services.stt import DeepgramSTTService
from app.services.llm import GroqLLMService
from app.services.tts import CartesiaTTSService
from app.services.audio_metrics import AudioMetricsService
from app.services.vad import VoiceActivityDetector
from app.services.search import search_service
from app.services.metrics import metrics_collector
from app.core.cache import get_semantic_cache
from app.core.memory import ConversationMemory
from app.core.provider_manager import ProviderManager, get_stt_manager, get_llm_manager, get_tts_manager

logger = logging.getLogger(__name__)


class VoiceSessionStreaming:
    """
    Voice Session with True VAD-based Turn Detection
    
    - Accumulates audio chunks continuously
    - Tracks speech/silence state using RMS
    - Concatenates all audio chunks before STT
    - Processes when silence is detected after speech
    """
    
    # Configuration
    SILENCE_THRESHOLD = 0.02  # RMS below this = silence
    SILENCE_DURATION = 2.5    # Seconds of silence to trigger processing
    MIN_SPEECH_CHUNKS = 1     # Minimum chunks with speech before considering it a turn
    
    def __init__(
        self,
        session_id: str,
        websocket: WebSocket,
        stt_service: DeepgramSTTService = None,
        llm_service: GroqLLMService = None,
        tts_service: CartesiaTTSService = None,
        noise_suppressor=None,
        vad_service: Optional[VoiceActivityDetector] = None,
        audio_metrics_service: Optional[AudioMetricsService] = None,
        user_id: str = None,
        initial_history: List[dict] = None,
        use_provider_managers: bool = True
    ):
        self.session_id = session_id
        self.websocket = websocket
        
        # Provider managers for fallback support
        self.use_provider_managers = use_provider_managers
        if use_provider_managers:
            self.stt_manager = get_stt_manager()
            self.llm_manager = get_llm_manager()
            self.tts_manager = get_tts_manager()
            logger.info(f"📡 Session {session_id[:8]} using provider managers with fallback")
        
        # Direct services (used as fallback if no managers)
        self.stt_service = stt_service
        self.llm_service = llm_service
        self.tts_service = tts_service
        self.audio_metrics_service = audio_metrics_service
        self.vad_service = vad_service
        self.user_id = user_id
        
        # Session state
        self.state: str = "idle"
        self.conversation_history: List[dict] = initial_history or []
        self.processing_audio: bool = False
        self.interrupted: bool = False  # Barge-in interrupt flag
        
        # Memory and cache
        self.memory = ConversationMemory(session_id=session_id, user_id=user_id)
        self._cache = None  # Lazy loaded
        
        # VAD state
        self.audio_chunks: List[bytes] = []
        self.speech_detected: bool = False
        self.speech_chunk_count: int = 0
        self.last_speech_time: float = 0
        self.silence_start_time: float = 0
        
    async def send_state_update(self, state: str):
        """Send state update to frontend"""
        self.state = state
        try:
            await self.websocket.send_json({
                "type": "state_change",
                "state": state
            })
        except Exception as e:
            logger.error(f"Error sending state: {e}")
    
    async def send_transcript_update(self, speaker: str, text: str, is_final: bool = True, message_id: str = None):
        """Send transcript update to frontend"""
        try:
            if not message_id:
                message_id = f"{speaker}_{int(time.time()*1000)}"
                
            await self.websocket.send_json({
                "type": "transcript_update",
                "data": {
                    "id": message_id,
                    "speaker": speaker,
                    "text": text,
                    "timestamp": time.time(),
                    "is_final": is_final
                }
            })
        except Exception as e:
            logger.error(f"Error sending transcript: {e}")
    
    async def send_audio_metrics(self, metrics: dict):
        """Send audio quality metrics to frontend"""
        try:
            await self.websocket.send_json({
                "type": "audio_metrics",
                "data": metrics
            })
        except Exception as e:
            logger.error(f"Error sending metrics: {e}")
    
    async def send_vad_status(self, is_speech: bool, speech_ended: bool = False):
        """Send VAD status to frontend"""
        try:
            await self.websocket.send_json({
                "type": "vad_status",
                "data": {
                    "is_speech": is_speech,
                    "speech_ended": speech_ended
                }
            })
        except Exception as e:
            logger.error(f"Error sending VAD status: {e}")
    
    async def send_error(self, error_message: str):
        """Send error to frontend"""
        try:
            await self.websocket.send_json({
                "type": "error",
                "message": error_message
            })
        except Exception as e:
            logger.error(f"Error sending error: {e}")
    
    async def handle_interrupt(self):
        """Handle barge-in interrupt from user"""
        logger.info("🛑 Interrupt received - stopping TTS")
        self.interrupted = True
        self.processing_audio = False
        
        # Send interrupt acknowledgment to frontend
        try:
            await self.websocket.send_json({
                "type": "interrupt_ack",
                "message": "Playback stopped"
            })
        except Exception as e:
            logger.error(f"Error sending interrupt ack: {e}")
        
        # Transition back to listening state
        await self.send_state_update("listening")
    
    def reset_interrupt(self):
        """Reset interrupt flag for new turn"""
        self.interrupted = False


    def _is_valid_webm(self, audio_data: bytes) -> bool:
        """Check if audio data has a valid WebM EBML header"""
        if len(audio_data) < 4:
            return False
        return audio_data[:4] == b'\x1a\x45\xdf\xa3'
    
    def _check_ffprobe_available(self) -> bool:
        """Check if ffprobe is available on the system."""
        import shutil
        return shutil.which("ffprobe") is not None
    
    def _concatenate_audio_chunks(self, chunks: List[bytes]) -> Optional[bytes]:
        """Concatenate multiple WebM audio chunks into a single audio file."""
        try:
            if not chunks:
                return None
            
            # Check ffprobe availability FIRST
            if not self._check_ffprobe_available():
                logger.warning("⚠️ ffprobe not available - returning chunks for individual processing")
                # Return None to signal caller to use per-chunk transcription
                return None
            
            # ffprobe is available, use pydub to properly merge
            combined = AudioSegment.empty()
            successful_chunks = 0
            
            for i, chunk in enumerate(chunks):
                try:
                    audio = AudioSegment.from_file(io.BytesIO(chunk), format="webm")
                    combined += audio
                    successful_chunks += 1
                except Exception as e:
                    logger.warning(f"Failed to process chunk {i}: {e}")
                    continue
            
            if successful_chunks == 0:
                logger.error("No chunks could be processed")
                return None
            
            logger.info(f"✅ Concatenated {successful_chunks}/{len(chunks)} chunks, duration: {len(combined)}ms")
            
            # Export as WAV for Deepgram
            output = io.BytesIO()
            combined = combined.set_frame_rate(16000).set_channels(1)
            combined.export(output, format="wav")
            return output.getvalue()
            
        except Exception as e:
            logger.error(f"Error concatenating audio: {e}", exc_info=True)
            return None
    
    async def _transcribe_chunks_individually(self, chunks: List[bytes]) -> Optional[str]:
        """Fallback: Transcribe each WebM chunk individually and combine transcripts."""
        try:
            transcripts = []
            
            for i, chunk in enumerate(chunks):
                try:
                    if len(chunk) < 1000:
                        continue  # Skip tiny chunks
                    
                    # Each chunk is a valid WebM file - send directly to Deepgram
                    if self.use_provider_managers:
                        transcript = await self.stt_manager.execute(chunk)
                    else:
                        transcript = await self.stt_service.transcribe(chunk)
                    
                    if transcript and transcript.strip():
                        transcripts.append(transcript.strip())
                        logger.info(f"📝 Chunk {i+1}/{len(chunks)}: '{transcript}'")
                        
                except Exception as e:
                    logger.warning(f"Failed to transcribe chunk {i}: {e}")
                    continue
            
            if not transcripts:
                return None
            
            combined_transcript = " ".join(transcripts)
            logger.info(f"📝 Combined transcript from {len(transcripts)} chunks: '{combined_transcript}'")
            return combined_transcript
            
        except Exception as e:
            logger.error(f"Error in chunk-by-chunk transcription: {e}", exc_info=True)
            return None
    
    async def _process_transcript_to_response(self, transcript: str):
        """Process a transcript directly through LLM->TTS (skip STT since we already have transcript)."""
        try:
            if not transcript or len(transcript.strip()) < 2:
                logger.info("Empty transcript, back to listening")
                await self.send_state_update("listening")
                return
            
            correlation_id = str(uuid.uuid4())[:8]
            metrics_collector.start_request(correlation_id, self.session_id, self.user_id or "")
            
            await self.send_state_update("thinking")
            logger.info(f"🎤 [{correlation_id}] Processing transcript: '{transcript}'")
            
            user_msg_id = f"user_{int(time.time()*1000)}"
            await self.send_transcript_update("user", transcript, is_final=True, message_id=user_msg_id)
            self.conversation_history.append({"role": "user", "content": transcript})
            
            # Save user message
            try:
                await self.memory.save_message(role="user", content=transcript, metadata={"correlation_id": correlation_id})
            except Exception as e:
                logger.warning(f"Failed to save user message: {e}")
            
            # LLM streaming
            logger.info(f"🤖 [{correlation_id}] LLM streaming...")
            metrics_collector.start_stage(correlation_id, "llm")
            
            full_response = ""
            sentence_buffer = ""
            first_audio_sent = False
            assistant_msg_id = f"assistant_{int(time.time()*1000)}"
            
            # Get token generator
            if self.use_provider_managers:
                llm_provider = self.llm_manager.current_provider
                if llm_provider:
                    token_generator = llm_provider.stream_complete(self.conversation_history)
                else:
                    raise Exception("No LLM provider available")
            else:
                token_generator = self.llm_service.stream_complete(self.conversation_history)
            
            async for token in token_generator:
                if self.interrupted:
                    logger.info("🛑 Interrupted during LLM streaming")
                    break
                
                full_response += token
                sentence_buffer += token
                
                await self.send_transcript_update("assistant", full_response, is_final=False, message_id=assistant_msg_id)
                
                if token in ['.', '!', '?', '\n'] and len(sentence_buffer.strip()) > 10:
                    if self.interrupted:
                        break
                    
                    if not first_audio_sent:
                        await self.send_state_update("speaking")
                        first_audio_sent = True
                    
                    sentence = sentence_buffer.strip()
                    logger.info(f"🔊 TTS: {sentence[:50]}...")
                    
                    try:
                        if self.use_provider_managers:
                            audio_data = await self.tts_manager.execute(sentence)
                        else:
                            audio_data = await self.tts_service.synthesize(sentence)
                        if audio_data and not self.interrupted:
                            audio_base64 = base64.b64encode(audio_data).decode('utf-8')
                            await self.websocket.send_json({"type": "audio", "data": audio_base64})
                    except Exception as e:
                        logger.error(f"TTS error: {e}")
                    
                    sentence_buffer = ""
            
            metrics_collector.end_stage(correlation_id, "llm")
            
            # Final sentence
            if sentence_buffer.strip() and not self.interrupted:
                if not first_audio_sent:
                    await self.send_state_update("speaking")
                try:
                    if self.use_provider_managers:
                        audio_data = await self.tts_manager.execute(sentence_buffer.strip())
                    else:
                        audio_data = await self.tts_service.synthesize(sentence_buffer.strip())
                    if audio_data and not self.interrupted:
                        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
                        await self.websocket.send_json({"type": "audio", "data": audio_base64})
                except Exception as e:
                    logger.error(f"TTS error: {e}")
            
            # Finalize
            await self.send_transcript_update("assistant", full_response, is_final=True, message_id=assistant_msg_id)
            self.conversation_history.append({"role": "assistant", "content": full_response})
            
            try:
                await self.memory.save_message(role="assistant", content=full_response, metadata={"correlation_id": correlation_id})
            except Exception as e:
                logger.warning(f"Failed to save response: {e}")
            
            metrics_collector.end_request(correlation_id, success=True)
            
        except Exception as e:
            logger.error(f"Error in _process_transcript_to_response: {e}", exc_info=True)
            await self.send_error(str(e))

    
    async def process_audio_chunk(self, audio_data: bytes):
        """Process incoming audio chunk with true VAD."""
        try:
            # BARGE-IN: If user sends audio while AI is speaking, interrupt!
            if self.state == "speaking":
                chunk_size = len(audio_data)
                # Only trigger for significant audio (not tiny fragments)
                if chunk_size > 500:
                    logger.info(f"🛑 BARGE-IN: Audio received while speaking ({chunk_size} bytes) - interrupting!")
                    self.interrupted = True
                    await self.handle_interrupt()
                    # Queue this audio chunk for processing after interrupt
                    self.audio_chunks = [audio_data]
                    self.speech_detected = True
                    self.speech_chunk_count = 1
                    return
                return
            
            # Skip if already processing
            if self.processing_audio:
                logger.debug(f"Skipping - already processing")
                return
            
            chunk_size = len(audio_data)
            
            if not self._is_valid_webm(audio_data):
                logger.warning(f"⚠️ Invalid WebM header")
                return
            
            # Analyze audio for speech detection
            is_speech = False
            current_rms = 0
            using_fallback = False
            
            if self.audio_metrics_service:
                metrics = self.audio_metrics_service.analyze(audio_data)
                if metrics["quality_score"] > 0:
                    await self.send_audio_metrics(metrics)
                    current_rms = metrics["rms"]
                    is_speech = current_rms > self.SILENCE_THRESHOLD
                else:
                    # Fallback mode: ffprobe not available
                    using_fallback = True
                    is_speech = True  # Assume speech in fallback mode
            else:
                using_fallback = True
                is_speech = True

            now = time.time()
            
            # PUSH-TO-TALK DETECTION: Large chunk = process immediately
            # PTT sends all audio at once (~14-15KB), while VAD sends 1.5s chunks (~2-3KB)
            LARGE_CHUNK_THRESHOLD = 10000
            if chunk_size > LARGE_CHUNK_THRESHOLD:
                logger.info(f"📦 Large chunk detected ({chunk_size} bytes) - likely Push-to-Talk")
                self.audio_chunks.append(audio_data)
                await self.send_vad_status(is_speech=True)
                await self._process_accumulated_audio()
                return
            
            # Store the chunk for VAD mode
            self.audio_chunks.append(audio_data)
            
            # FALLBACK MODE: Timer-based processing (since we can't detect silence)
            if using_fallback:
                self.speech_detected = True
                self.speech_chunk_count += 1
                await self.send_vad_status(is_speech=True)
                
                # Process after accumulating enough audio (6 chunks = ~9 seconds at 1.5s/chunk)
                # Or if we have minimum chunks and haven't received new audio in a while
                MAX_CHUNKS_FALLBACK = 6
                if len(self.audio_chunks) >= MAX_CHUNKS_FALLBACK:
                    logger.info(f"⏱️ Fallback: Processing {len(self.audio_chunks)} chunks (timer-based)")
                    await self._process_accumulated_audio()
                else:
                    logger.info(f"📦 Fallback mode: {len(self.audio_chunks)}/{MAX_CHUNKS_FALLBACK} chunks")
                return
            
            # NORMAL MODE: RMS-based speech detection
            if is_speech:
                self.speech_detected = True
                self.speech_chunk_count += 1
                self.last_speech_time = now
                self.silence_start_time = 0
                
                await self.send_vad_status(is_speech=True)
                logger.info(f"🗣️ Speech (RMS={current_rms:.3f}, total chunks={len(self.audio_chunks)})")
                
            else:
                await self.send_vad_status(is_speech=False)
                
                if self.speech_detected and self.speech_chunk_count >= self.MIN_SPEECH_CHUNKS:
                    if self.silence_start_time == 0:
                        self.silence_start_time = now
                        logger.info(f"🔇 Silence started (accumulated {len(self.audio_chunks)} chunks)")
                    
                    silence_duration = now - self.silence_start_time
                    logger.info(f"⏱️ Silence: {silence_duration:.1f}s / {self.SILENCE_DURATION}s")
                    
                    if silence_duration >= self.SILENCE_DURATION:
                        logger.info(f"✅ Processing {len(self.audio_chunks)} chunks")
                        await self._process_accumulated_audio()

                
        except Exception as e:
            logger.error(f"Error processing chunk: {e}", exc_info=True)
            await self.send_error(str(e))
    
    async def _process_accumulated_audio(self):
        """Process all accumulated audio through STT->LLM->TTS pipeline"""
        if self.processing_audio:
            return
            
        if not self.audio_chunks:
            return
        
        self.processing_audio = True
        
        chunks_to_process = self.audio_chunks.copy()
        self.audio_chunks.clear()
        self.speech_detected = False
        self.speech_chunk_count = 0
        self.silence_start_time = 0
        
        try:
            logger.info(f"📦 Processing {len(chunks_to_process)} audio chunks...")
            audio_to_process = self._concatenate_audio_chunks(chunks_to_process)
            
            if audio_to_process:
                # ffprobe available - use concatenated audio
                logger.info(f"📤 Sending concatenated audio: {len(audio_to_process)} bytes")
                await self.process_turn_with_streaming(audio_to_process)
            else:
                # ffprobe not available - transcribe each chunk individually
                logger.info(f"📝 Using chunk-by-chunk transcription for {len(chunks_to_process)} chunks")
                transcript = await self._transcribe_chunks_individually(chunks_to_process)
                
                if transcript:
                    # Skip STT (already done), go directly to LLM -> TTS
                    await self._process_transcript_to_response(transcript)
                else:
                    logger.warning("No transcript from chunk-by-chunk processing")
                    
        except Exception as e:
            logger.error(f"Error: {e}", exc_info=True)
            await self.send_error(str(e))
        finally:
            self.processing_audio = False
            await self.send_state_update("listening")

    
    async def process_turn_with_streaming(self, audio_bytes: bytes):
        """Process a complete turn with streaming LLM and sentence-by-sentence TTS"""
        try:
            if len(audio_bytes) < 1000:
                logger.info(f"Skipping short audio ({len(audio_bytes)} bytes)")
                return
            
            # Start metrics tracking with correlation ID
            correlation_id = str(uuid.uuid4())[:8]
            metrics_collector.start_request(correlation_id, self.session_id, self.user_id or "")
            used_search = False
            
            await self.send_state_update("thinking")
            logger.info(f"🎤 [{correlation_id}] STT: {len(audio_bytes)} bytes")
            
            user_msg_id = f"user_{int(time.time()*1000)}"
            
            # STT timing - with provider manager fallback
            metrics_collector.start_stage(correlation_id, "stt")
            try:
                if self.use_provider_managers:
                    # Use provider manager with automatic fallback
                    transcript = await self.stt_manager.execute(audio_bytes)
                    current_stt = self.stt_manager.current_provider.name if self.stt_manager.current_provider else "unknown"
                    logger.info(f"📝 [{correlation_id}] STT ({current_stt}): '{transcript}'")
                else:
                    # Direct service call (legacy)
                    transcript = await self.stt_service.transcribe(audio_bytes)
                    logger.info(f"📝 [{correlation_id}] STT result: '{transcript}'")
                metrics_collector.end_stage(correlation_id, "stt")
            except Exception as e:
                metrics_collector.end_stage(correlation_id, "stt")
                metrics_collector.end_request(correlation_id, success=False, error_message=str(e))
                logger.error(f"STT error: {e}", exc_info=True)
                await self.send_state_update("listening")
                return
            except Exception as e:
                metrics_collector.end_stage(correlation_id, "stt")
                metrics_collector.end_request(correlation_id, success=False, error_message=str(e))
                logger.error(f"STT error: {e}", exc_info=True)
                await self.send_state_update("listening")
                return
            
            if not transcript or len(transcript.strip()) < 2:
                logger.info(f"[{correlation_id}] Empty transcript, back to listening")
                # Don't count empty transcripts as failed - they're just silence/noise
                # Remove from in-flight tracking without recording as failure
                metrics_collector._in_flight.pop(correlation_id, None)
                await self.send_state_update("listening")
                return
            
            await self.send_transcript_update("user", transcript, is_final=True, message_id=user_msg_id)
            self.conversation_history.append({"role": "user", "content": transcript})
            
            # Save user message to persistent memory
            try:
                await self.memory.save_message(
                    role="user",
                    content=transcript,
                    metadata={"correlation_id": correlation_id}
                )
            except Exception as e:
                logger.warning(f"Failed to save user message: {e}")
            
            # Check semantic cache FIRST (before search/LLM)
            cache_hit = None
            try:
                cache = await get_semantic_cache()
                cache_hit = await cache.get(transcript)
                if cache_hit:
                    logger.info(f"🎯 [{correlation_id}] Cache HIT! Similarity: {cache_hit['metadata'].get('similarity', 'N/A')}")
            except Exception as e:
                logger.warning(f"Cache lookup failed: {e}")
            
            # If we have a cache hit, use it directly (skip LLM)
            if cache_hit and not needs_search:
                cached_response = cache_hit["response"]
                logger.info(f"⚡ [{correlation_id}] Using cached response")
                
                # Send cached response
                await self.send_state_update("speaking")
                assistant_msg_id = f"assistant_{int(time.time()*1000)}"
                await self.send_transcript_update("assistant", cached_response, is_final=True, message_id=assistant_msg_id)
                
                # Generate TTS for cached response
                if not self.interrupted:
                    try:
                        # Use provider manager for TTS with fallback
                        if self.use_provider_managers:
                            audio_data = await self.tts_manager.execute(cached_response)
                        else:
                            audio_data = await self.tts_service.synthesize(cached_response)
                        if audio_data and not self.interrupted:
                            audio_base64 = base64.b64encode(audio_data).decode('utf-8')
                            await self.websocket.send_json({
                                "type": "audio_response",
                                "data": {"audio": audio_base64, "format": "wav"}
                            })
                    except Exception as e:
                        logger.error(f"TTS error for cached response: {e}")
                
                self.conversation_history.append({"role": "assistant", "content": cached_response})
                
                # Save to memory
                try:
                    await self.memory.save_message(
                        role="assistant",
                        content=cached_response,
                        metadata={"correlation_id": correlation_id, "cached": True}
                    )
                except Exception as e:
                    logger.warning(f"Failed to save cached response: {e}")
                
                metrics_collector.end_request(correlation_id, success=True, used_search=False)
                await self.send_state_update("listening")
                return
            
            # Check if web search is needed
            search_context = ""
            citation = ""
            needs_search, search_query = await self.llm_service.detect_search_needed(transcript)
            
            if needs_search and search_query:
                logger.info(f"🔍 [{correlation_id}] Executing web search: '{search_query}'")
                metrics_collector.start_stage(correlation_id, "search")
                search_results = await search_service.search(search_query, max_results=3)
                metrics_collector.end_stage(correlation_id, "search")
                used_search = True
                
                if search_results:
                    search_context = search_service.format_results_for_llm(search_results)
                    citation = search_service.format_citations(search_results)
                    logger.info(f"📚 [{correlation_id}] Found {len(search_results)} search results")
            
            logger.info(f"🤖 [{correlation_id}] LLM streaming...")
            metrics_collector.start_stage(correlation_id, "llm")
            
            full_response = ""
            sentence_buffer = ""
            first_audio_sent = False
            
            assistant_msg_id = f"assistant_{int(time.time()*1000)}"
            
            # Get token generator - with provider manager fallback support
            if self.use_provider_managers:
                # Use provider manager
                llm_provider = self.llm_manager.current_provider
                if llm_provider:
                    if search_context:
                        # Try search context first, fall back to regular if not available
                        try:
                            token_generator = llm_provider.service.stream_complete_with_context(
                                self.conversation_history,
                                search_context=search_context,
                                citation=citation
                            )
                        except AttributeError:
                            # Backup provider might not have stream_complete_with_context
                            token_generator = llm_provider.stream_complete(self.conversation_history)
                    else:
                        token_generator = llm_provider.stream_complete(self.conversation_history)
                    current_llm = llm_provider.name
                    logger.info(f"🤖 [{correlation_id}] Using LLM provider: {current_llm}")
                else:
                    raise Exception("No LLM provider available")
            else:
                # Use search-aware streaming if we have search context (legacy mode)
                if search_context:
                    token_generator = self.llm_service.stream_complete_with_context(
                        self.conversation_history,
                        search_context=search_context,
                        citation=citation
                    )
                else:
                    token_generator = self.llm_service.stream_complete(self.conversation_history)
            
            async for token in token_generator:
                # Check for interrupt on EVERY token
                if self.interrupted:
                    logger.info("🛑 Interrupted during LLM streaming - breaking")
                    break
                
                full_response += token
                sentence_buffer += token
                
                await self.send_transcript_update("assistant", full_response, is_final=False, message_id=assistant_msg_id)
                
                if token in ['.', '!', '?', '\n'] and len(sentence_buffer.strip()) > 10:
                    # Double-check interrupt before TTS
                    if self.interrupted:
                        logger.info("🛑 Interrupted before TTS")
                        break
                    
                    if not first_audio_sent:
                        await self.send_state_update("speaking")
                        first_audio_sent = True
                    
                    sentence = sentence_buffer.strip()
                    logger.info(f"🔊 TTS: {sentence[:50]}...")
                    
                    try:
                        # Use provider manager for TTS with fallback
                        if self.use_provider_managers:
                            audio_data = await self.tts_manager.execute(sentence)
                        else:
                            audio_data = await self.tts_service.synthesize(sentence)
                        if audio_data and not self.interrupted:
                            audio_base64 = base64.b64encode(audio_data).decode('utf-8')
                            await self.websocket.send_json({
                                "type": "audio",
                                "data": audio_base64
                            })
                    except Exception as e:
                        logger.error(f"TTS error: {e}")
                    
                    sentence_buffer = ""
            
            # Only process remaining buffer if NOT interrupted
            if sentence_buffer.strip() and not self.interrupted:
                if not first_audio_sent:
                    await self.send_state_update("speaking")
                
                try:
                    # Use provider manager for TTS with fallback
                    if self.use_provider_managers:
                        audio_data = await self.tts_manager.execute(sentence_buffer.strip())
                    else:
                        audio_data = await self.tts_service.synthesize(sentence_buffer.strip())
                    if audio_data and not self.interrupted:
                        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
                        await self.websocket.send_json({
                            "type": "audio",
                            "data": audio_base64
                        })
                except Exception as e:
                    logger.error(f"TTS error: {e}")
            
            # End LLM timing (includes streaming + TTS interleaved)
            metrics_collector.end_stage(correlation_id, "llm")
            
            # Only add to history if NOT interrupted
            if not self.interrupted:
                await self.send_transcript_update("assistant", full_response, is_final=True, message_id=assistant_msg_id)
                self.conversation_history.append({"role": "assistant", "content": full_response})
                logger.info(f"✅ [{correlation_id}] Done: {full_response[:80]}...")
                metrics_collector.end_request(correlation_id, success=True, used_search=used_search)
                
                # Cache the response for future similar queries (if not search-based)
                if not used_search and len(full_response) > 20:
                    try:
                        cache = await get_semantic_cache()
                        await cache.set(
                            query=transcript,
                            response=full_response,
                            metadata={"correlation_id": correlation_id}
                        )
                    except Exception as e:
                        logger.warning(f"Failed to cache response: {e}")
                
                # Save assistant message to memory
                try:
                    await self.memory.save_message(
                        role="assistant",
                        content=full_response,
                        used_search=used_search,
                        search_query=search_query if used_search else None,
                        metadata={"correlation_id": correlation_id}
                    )
                except Exception as e:
                    logger.warning(f"Failed to save assistant message: {e}")
            else:
                logger.info(f"⏹️ [{correlation_id}] Response interrupted")
                metrics_collector.end_request(correlation_id, success=False, error_message="interrupted")
                await self.send_state_update("listening")

            
        except Exception as e:
            logger.error(f"Error: {e}", exc_info=True)
            # Try to end metrics if correlation_id exists
            if 'correlation_id' in locals():
                metrics_collector.end_request(correlation_id, success=False, error_message=str(e))
            await self.send_error(str(e))
    
    async def cleanup(self):
        """Cleanup session resources"""
        logger.info(f"Cleaning up {self.session_id}")
        self.audio_chunks.clear()
        self.speech_detected = False
        self.speech_chunk_count = 0
