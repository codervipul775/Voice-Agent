from fastapi import WebSocket
import asyncio
import json
import logging
from typing import Optional
from app.core.session_streaming import VoiceSessionStreaming
from app.services.stt import DeepgramSTTService
from app.services.llm import GroqLLMService
from app.services.tts import CartesiaTTSService

logger = logging.getLogger(__name__)

# Initialize services
stt_service = DeepgramSTTService()
llm_service = GroqLLMService()
tts_service = CartesiaTTSService()

async def handle_voice_session(websocket: WebSocket, session_id: str):
    """Handle voice session with streaming responses"""
    # Create streaming voice session
    session = VoiceSessionStreaming(
        session_id=session_id,
        websocket=websocket,
        stt_service=stt_service,
        llm_service=llm_service,
        tts_service=tts_service
    )
    
    logger.info(f"Voice session started (STREAMING): {session_id}")
    
    try:
        # Send initial state
        await session.send_state_update("listening")
        
        # Main message loop
        async for message in websocket.iter_bytes():
            try:
                logger.info(f"📩 Received audio chunk: {len(message)} bytes")
                await session.process_audio_chunk(message)
                logger.info(f"✅ Processed audio chunk successfully")
            except Exception as chunk_error:
                logger.error(f"❌ Error processing chunk: {chunk_error}", exc_info=True)
                await session.send_state_update("listening")
            
    except Exception as e:
        logger.error(f"Error in voice session {session_id}: {e}", exc_info=True)
        try:
            await session.send_error(str(e))
        except:
            pass
    finally:
        logger.info(f"Voice session ended: {session_id}")
        await session.cleanup()
