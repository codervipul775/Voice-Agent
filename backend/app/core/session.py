from fastapi import WebSocket
import asyncio
import logging
import time
from typing import Optional
from io import BytesIO

logger = logging.getLogger(__name__)

class VoiceSession:
    """Manages a single user's voice session"""
    
    def __init__(self, session_id: str, websocket: WebSocket, 
                 stt_service, llm_service, tts_service):
        self.session_id = session_id
        self.websocket = websocket
        self.stt_service = stt_service
        self.llm_service = llm_service
        self.tts_service = tts_service
        
        # State
        self.state = "listening"  # listening, thinking, speaking
        self.audio_buffer = BytesIO()
        self.conversation_history = []
        
        # For VAD and turn detection (simplified for Day 1)
        self.silence_start = None
        self.is_speaking = False
        
    async def send_state_update(self, state: str):
        """Send state update to frontend"""
        self.state = state
        await self.websocket.send_json({
            "type": "state_change",
            "state": state
        })
    
    async def send_transcript_update(self, speaker: str, text: str, 
                                    is_final: bool = False):
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
        """
        Process incoming audio chunk
        
        For Day 1: Simple implementation - each chunk is a complete WebM blob
        """
        try:
            # Don't process new audio if AI is currently speaking
            if self.state == "speaking":
                logger.info(f"Skipping audio chunk - AI is currently speaking")
                return
            
            # Each chunk from frontend is now a complete 7-second WebM blob
            # Process it immediately instead of accumulating
            if len(audio_data) > 5000:  # Only process if we have substantial audio
                await self.process_turn_with_audio(audio_data)
                
        except Exception as e:
            logger.error(f"Error processing audio chunk: {e}", exc_info=True)
            await self.send_error(str(e))
    
    async def process_turn_with_audio(self, audio_bytes: bytes):
        """Process a complete conversation turn with given audio"""
        try:
            if len(audio_bytes) < 10000:  # Skip very short audio (less than ~0.5 sec)
                logger.info(f"Skipping short audio chunk ({len(audio_bytes)} bytes)")
                await self.send_state_update("listening")
                return
            
            # 1. STT - Speech to Text
            await self.send_state_update("thinking")
            logger.info(f"Processing STT for session {self.session_id}, audio size: {len(audio_bytes)}")
            
            try:
                transcript = await self.stt_service.transcribe(audio_bytes)
            except Exception as e:
                logger.error(f"STT service error: {e}")
                # Don't send error to frontend, just go back to listening
                await self.send_state_update("listening")
                return
            
            if not transcript or len(transcript.strip()) < 2:
                logger.info(f"Empty or too short transcript, going back to listening")
                await self.send_state_update("listening")
                return
            
            logger.info(f"Transcript: {transcript}")
            
            # Send user transcript
            await self.send_transcript_update("user", transcript, is_final=True)
            self.conversation_history.append({
                "role": "user",
                "content": transcript
            })
            
            # 2. LLM - Generate Response
            logger.info(f"Getting LLM response for session {self.session_id}")
            
            response = await self.llm_service.complete(self.conversation_history)
            
            logger.info(f"LLM Response: {response}")
            
            # Send AI transcript
            await self.send_transcript_update("assistant", response, is_final=True)
            self.conversation_history.append({
                "role": "assistant",
                "content": response
            })
            
            # 3. TTS - Text to Speech
            await self.send_state_update("speaking")
            logger.info(f"Generating TTS for session {self.session_id}")
            
            audio_data = await self.tts_service.synthesize(response)
            
            logger.info(f"Generated TTS audio, size: {len(audio_data)} bytes")
            
            # Send audio to client as JSON message
            import base64
            audio_b64 = base64.b64encode(audio_data).decode('utf-8')
            await self.websocket.send_json({
                "type": "audio",
                "data": audio_b64
            })
            
            logger.info(f"Sent audio to client, going back to listening")
            
            # Back to listening
            await self.send_state_update("listening")
            
        except Exception as e:
            logger.error(f"Error processing turn: {e}", exc_info=True)
            await self.send_error(str(e))
            await self.send_state_update("listening")
    
    async def cleanup(self):
        """Cleanup session resources"""
        logger.info(f"Cleaning up session {self.session_id}")
        # Close any open connections, save history, etc.
