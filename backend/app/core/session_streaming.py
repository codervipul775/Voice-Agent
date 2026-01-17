import base64
import logging
import time
from typing import Optional
from fastapi import WebSocket
from app.services.stt import DeepgramSTTService
from app.services.llm import GroqLLMService
from app.services.tts import CartesiaTTSService

logger = logging.getLogger(__name__)

class VoiceSessionStreaming:
    """
    Voice Session with Streaming Support
    Handles a complete voice conversation session with streaming LLM responses
    """
    
    def __init__(
        self,
        session_id: str,
        websocket: WebSocket,
        stt_service: DeepgramSTTService,
        llm_service: GroqLLMService,
        tts_service: CartesiaTTSService
    ):
        self.session_id = session_id
        self.websocket = websocket
        self.stt_service = stt_service
        self.llm_service = llm_service
        self.tts_service = tts_service
        
        # Session state
        self.state: str = "idle"  # idle, listening, thinking, speaking, error
        self.conversation_history: list = []
        
    async def send_state_update(self, state: str):
        """Send state update to frontend"""
        self.state = state
        await self.websocket.send_json({
            "type": "state_change",
            "state": state
        })
    
    async def send_transcript_update(self, speaker: str, text: str, is_final: bool = True):
        """Send transcript update to frontend"""
        await self.websocket.send_json({
            "type": "transcript_update",
            "data": {
                "id": f"{speaker}_{int(time.time()*1000)}",
                "speaker": speaker,
                "text": text,
                "timestamp": time.time(),
                "is_final": is_final
            }
        })
    
    async def send_error(self, error_message: str):
        """Send error to frontend"""
        await self.websocket.send_json({
            "type": "error",
            "message": error_message
        })
        await self.send_state_update("error")
    
    async def process_audio_chunk(self, audio_data: bytes):
        """Process incoming audio chunk"""
        try:
            if self.state == "speaking":
                logger.info(f"Skipping audio chunk - AI is currently speaking")
                return
            
            if len(audio_data) > 5000:
                await self.process_turn_with_streaming(audio_data)
                
        except Exception as e:
            logger.error(f"Error processing audio chunk: {e}", exc_info=True)
            await self.send_error(str(e))
    
    async def process_turn_with_streaming(self, audio_bytes: bytes):
        """Process turn with streaming LLM and sentence-by-sentence TTS"""
        try:
            if len(audio_bytes) < 10000:
                logger.info(f"Skipping short audio chunk ({len(audio_bytes)} bytes)")
                await self.send_state_update("listening")
                return
            
            # 1. STT
            await self.send_state_update("thinking")
            logger.info(f"🎤 STT for session {self.session_id}, audio: {len(audio_bytes)} bytes")
            
            try:
                transcript = await self.stt_service.transcribe(audio_bytes)
            except Exception as e:
                logger.error(f"STT error: {e}")
                await self.send_state_update("listening")
                return
            
            if not transcript or len(transcript.strip()) < 2:
                logger.info(f"Empty transcript, back to listening")
                await self.send_state_update("listening")
                return
            
            logger.info(f"📝 Transcript: {transcript}")
            await self.send_transcript_update("user", transcript, is_final=True)
            self.conversation_history.append({"role": "user", "content": transcript})
            
            # 2. LLM Streaming + TTS
            logger.info(f"🤖 Streaming LLM response...")
            
            full_response = ""
            sentence_buffer = ""
            first_audio_sent = False
            
            async for token in self.llm_service.stream_complete(self.conversation_history):
                full_response += token
                sentence_buffer += token
                
                # Update transcript in real-time
                await self.send_transcript_update("assistant", full_response, is_final=False)
                
                # When we hit sentence boundary, generate TTS immediately
                if token in ['.', '!', '?', '\n'] and len(sentence_buffer.strip()) > 10:
                    if not first_audio_sent:
                        await self.send_state_update("speaking")
                        first_audio_sent = True
                    
                    logger.info(f"🔊 Generating TTS for: {sentence_buffer.strip()[:50]}...")
                    
                    try:
                        audio_data = await self.tts_service.synthesize(sentence_buffer.strip())
                        if audio_data:
                            audio_base64 = base64.b64encode(audio_data).decode('utf-8')
                            await self.websocket.send_json({
                                "type": "audio",
                                "data": audio_base64
                            })
                            logger.info(f"✅ Sent audio chunk ({len(audio_data)} bytes)")
                    except Exception as e:
                        logger.error(f"TTS error: {e}")
                    
                    sentence_buffer = ""
            
            # Handle remaining text
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
            
            # Final transcript
            await self.send_transcript_update("assistant", full_response, is_final=True)
            self.conversation_history.append({"role": "assistant", "content": full_response})
            
            logger.info(f"✅ Complete response: {full_response}")
            await self.send_state_update("listening")
            
        except Exception as e:
            logger.error(f"Error in streaming turn: {e}", exc_info=True)
            await self.send_error(str(e))
            await self.send_state_update("listening")
    
    async def cleanup(self):
        """Cleanup session resources"""
        logger.info(f"Cleaning up session {self.session_id}")
