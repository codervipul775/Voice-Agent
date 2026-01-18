"""
Voice Session with True VAD-based Turn Detection
Accumulates audio chunks and concatenates them properly for STT
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
    SILENCE_DURATION = 2.5    # Seconds of silence to trigger processing (reduced for faster response)
    MIN_SPEECH_CHUNKS = 1     # Minimum chunks with speech before considering it a turn
    
    def __init__(
        self,
        session_id: str,
        websocket: WebSocket,
        stt_service: DeepgramSTTService,
        llm_service: GroqLLMService,
        tts_service: CartesiaTTSService,
        noise_suppressor=None,
        vad_service=None,
        audio_metrics_service: Optional[AudioMetricsService] = None
    ):
        self.session_id = session_id
        self.websocket = websocket
        self.stt_service = stt_service
        self.llm_service = llm_service
        self.tts_service = tts_service
        self.audio_metrics_service = audio_metrics_service
        
        # Session state
        self.state: str = "idle"
        self.conversation_history: List[dict] = []
        self.processing_audio: bool = False
        
        # VAD state
        self.audio_chunks: List[bytes] = []       # Accumulated audio
        self.speech_detected: bool = False        # Has speech been detected in current turn?
        self.speech_chunk_count: int = 0          # Number of chunks with speech
        self.last_speech_time: float = 0          # When we last detected speech
        self.silence_start_time: float = 0        # When silence started
        
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

    def _is_valid_webm(self, audio_data: bytes) -> bool:
        """Check if audio data has a valid WebM EBML header"""
        if len(audio_data) < 4:
            return False
        return audio_data[:4] == b'\x1a\x45\xdf\xa3'
    
    def _concatenate_audio_chunks(self, chunks: List[bytes]) -> Optional[bytes]:
        """
        Concatenate multiple WebM audio chunks into a single audio file.
        Uses pydub to convert each chunk to PCM, concatenate, then export.
        """
        try:
            if not chunks:
                return None
            
            combined = AudioSegment.empty()
            successful_chunks = 0
            
            for i, chunk in enumerate(chunks):
                try:
                    # Convert WebM to AudioSegment
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
            
            # Export as WAV for Deepgram (simpler, no codec issues)
            output = io.BytesIO()
            combined = combined.set_frame_rate(16000).set_channels(1)  # Normalize for STT
            combined.export(output, format="wav")
            return output.getvalue()
            
        except Exception as e:
            logger.error(f"Error concatenating audio: {e}", exc_info=True)
            return None
    
    async def process_audio_chunk(self, audio_data: bytes):
        """
        Process incoming audio chunk with true VAD.
        Accumulates chunks and monitors for silence to trigger processing.
        """
        try:
            # Skip if currently speaking or processing
            if self.state == "speaking" or self.processing_audio:
                logger.debug(f"Skipping - busy (state={self.state})")
                return
            
            chunk_size = len(audio_data)
            
            # Validate WebM
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
            # PTT mode sends one big chunk (typically > 15KB for a few seconds of speech)
            LARGE_CHUNK_THRESHOLD = 15000  # 15KB
            if chunk_size > LARGE_CHUNK_THRESHOLD:
                logger.info(f"📦 Large chunk detected ({chunk_size} bytes) - likely Push-to-Talk")
                self.audio_chunks.append(audio_data)
                await self.send_vad_status(is_speech=True)
                await self._process_accumulated_audio()
                return
            
            # Store the chunk for VAD mode
            self.audio_chunks.append(audio_data)
            
            if is_speech:
                # Speech detected
                self.speech_detected = True
                self.speech_chunk_count += 1
                self.last_speech_time = now
                self.silence_start_time = 0  # Reset silence timer
                
                await self.send_vad_status(is_speech=True)
                logger.info(f"🗣️ Speech (RMS={current_rms:.3f}, total chunks={len(self.audio_chunks)})")
                
            else:
                # Silence detected
                await self.send_vad_status(is_speech=False)
                
                # If we had speech before, start/continue silence timer
                if self.speech_detected and self.speech_chunk_count >= self.MIN_SPEECH_CHUNKS:
                    if self.silence_start_time == 0:
                        self.silence_start_time = now
                        logger.info(f"🔇 Silence started (accumulated {len(self.audio_chunks)} chunks)")
                    
                    silence_duration = now - self.silence_start_time
                    logger.info(f"⏱️ Silence: {silence_duration:.1f}s / {self.SILENCE_DURATION}s")
                    
                    # Check if silence threshold reached
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
        
        # Take the chunks and reset state
        chunks_to_process = self.audio_chunks.copy()
        self.audio_chunks.clear()
        self.speech_detected = False
        self.speech_chunk_count = 0
        self.silence_start_time = 0
        
        # CONCATENATE ALL CHUNKS into single audio
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
            
            # 1. STT
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
            
            # 2. LLM + TTS
            logger.info("🤖 LLM streaming...")
            
            full_response = ""
            sentence_buffer = ""
            first_audio_sent = False
            
            assistant_msg_id = f"assistant_{int(time.time()*1000)}"
            
            async for token in self.llm_service.stream_complete(self.conversation_history):
                full_response += token
                sentence_buffer += token
                
                await self.send_transcript_update("assistant", full_response, is_final=False, message_id=assistant_msg_id)
                
                if token in ['.', '!', '?', '\n'] and len(sentence_buffer.strip()) > 10:
                    if not first_audio_sent:
                        await self.send_state_update("speaking")
                        first_audio_sent = True
                    
                    sentence = sentence_buffer.strip()
                    logger.info(f"🔊 TTS: {sentence[:50]}...")
                    
                    try:
                        audio_data = await self.tts_service.synthesize(sentence)
                        if audio_data:
                            audio_base64 = base64.b64encode(audio_data).decode('utf-8')
                            await self.websocket.send_json({
                                "type": "audio",
                                "data": audio_base64
                            })
                    except Exception as e:
                        logger.error(f"TTS error: {e}")
                    
                    sentence_buffer = ""
            
            # Remaining text
            if sentence_buffer.strip():
                if not first_audio_sent:
                    await self.send_state_update("speaking")
                
                try:
                    audio_data = await self.tts_service.synthesize(sentence_buffer.strip())
                    if audio_data:
                        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
                        await self.websocket.send_json({
                            "type": "audio",
                            "data": audio_base64
                        })
                except Exception as e:
                    logger.error(f"TTS error: {e}")
            
            await self.send_transcript_update("assistant", full_response, is_final=True, message_id=assistant_msg_id)
            self.conversation_history.append({"role": "assistant", "content": full_response})
            
            logger.info(f"✅ Done: {full_response[:80]}...")
            
        except Exception as e:
            logger.error(f"Error: {e}", exc_info=True)
            await self.send_error(str(e))
    
    async def cleanup(self):
        """Cleanup session resources"""
        logger.info(f"Cleaning up {self.session_id}")
        self.audio_chunks.clear()
        self.speech_detected = False
        self.speech_chunk_count = 0
