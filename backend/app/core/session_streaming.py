"""
Voice Session with Streaming Support and Audio Metrics
"""
import base64
import logging
import time
import io
from typing import Optional, List
from fastapi import WebSocket
from pydub import AudioSegment
from app.services.stt import DeepgramSTTService
from app.services.llm import GroqLLMService
from app.services.tts import CartesiaTTSService
from app.services.audio_metrics import AudioMetricsService
from app.services.vad import VoiceActivityDetector
from app.services.search import search_service

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
        stt_service: DeepgramSTTService,
        llm_service: GroqLLMService,
        tts_service: CartesiaTTSService,
        noise_suppressor=None,
        vad_service: Optional[VoiceActivityDetector] = None,
        audio_metrics_service: Optional[AudioMetricsService] = None,
        user_id: str = None,
        initial_history: List[dict] = None
    ):
        self.session_id = session_id
        self.websocket = websocket
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
    
    def _concatenate_audio_chunks(self, chunks: List[bytes]) -> Optional[bytes]:
        """Concatenate multiple WebM audio chunks into a single audio file."""
        try:
            if not chunks:
                return None
            
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
            
            if self.audio_metrics_service:
                metrics = self.audio_metrics_service.analyze(audio_data)
                if metrics["quality_score"] > 0:
                    await self.send_audio_metrics(metrics)
                    current_rms = metrics["rms"]
                    is_speech = current_rms > self.SILENCE_THRESHOLD
            
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
        
        logger.info(f"📦 Concatenating {len(chunks_to_process)} audio chunks...")
        audio_to_process = self._concatenate_audio_chunks(chunks_to_process)
        
        if not audio_to_process:
            logger.error("Failed to concatenate audio")
            self.processing_audio = False
            await self.send_state_update("listening")
            return
        
        logger.info(f"📤 Sending concatenated audio: {len(audio_to_process)} bytes")
        
        try:
            await self.process_turn_with_streaming(audio_to_process)
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
            
            await self.send_state_update("thinking")
            logger.info(f"🎤 STT: {len(audio_bytes)} bytes")
            
            user_msg_id = f"user_{int(time.time()*1000)}"
            
            try:
                transcript = await self.stt_service.transcribe(audio_bytes)
                logger.info(f"📝 STT result: '{transcript}'")
            except Exception as e:
                logger.error(f"STT error: {e}", exc_info=True)
                await self.send_state_update("listening")
                return
            
            if not transcript or len(transcript.strip()) < 2:
                logger.info("Empty transcript, back to listening")
                await self.send_state_update("listening")
                return
            
            await self.send_transcript_update("user", transcript, is_final=True, message_id=user_msg_id)
            self.conversation_history.append({"role": "user", "content": transcript})
            
            # Check if web search is needed
            search_context = ""
            citation = ""
            needs_search, search_query = await self.llm_service.detect_search_needed(transcript)
            
            if needs_search and search_query:
                logger.info(f"🔍 Executing web search: '{search_query}'")
                search_results = await search_service.search(search_query, max_results=3)
                
                if search_results:
                    search_context = search_service.format_results_for_llm(search_results)
                    citation = search_service.format_citations(search_results)
                    logger.info(f"📚 Found {len(search_results)} search results")
            
            logger.info("🤖 LLM streaming...")
            
            full_response = ""
            sentence_buffer = ""
            first_audio_sent = False
            
            assistant_msg_id = f"assistant_{int(time.time()*1000)}"
            
            # Use search-aware streaming if we have search context
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
                    audio_data = await self.tts_service.synthesize(sentence_buffer.strip())
                    if audio_data and not self.interrupted:
                        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
                        await self.websocket.send_json({
                            "type": "audio",
                            "data": audio_base64
                        })
                except Exception as e:
                    logger.error(f"TTS error: {e}")
            
            # Only add to history if NOT interrupted
            if not self.interrupted:
                await self.send_transcript_update("assistant", full_response, is_final=True, message_id=assistant_msg_id)
                self.conversation_history.append({"role": "assistant", "content": full_response})
                logger.info(f"✅ Done: {full_response[:80]}...")
            else:
                logger.info("⏹️ Response interrupted - not adding incomplete response to history")
                await self.send_state_update("listening")
            
        except Exception as e:
            logger.error(f"Error: {e}", exc_info=True)
            await self.send_error(str(e))
    
    async def cleanup(self):
        """Cleanup session resources"""
        logger.info(f"Cleaning up {self.session_id}")
        self.audio_chunks.clear()
        self.speech_detected = False
        self.speech_chunk_count = 0
