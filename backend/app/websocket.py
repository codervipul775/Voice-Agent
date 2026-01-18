"""
WebSocket Handler for Voice Sessions
"""

from fastapi import WebSocket
import logging
from app.core.session_streaming import VoiceSessionStreaming
from app.services.stt import DeepgramSTTService
from app.services.llm import GroqLLMService
from app.services.tts import CartesiaTTSService
from app.services.audio_metrics import create_audio_metrics_service

logger = logging.getLogger(__name__)

# Initialize services (singleton)
stt_service = DeepgramSTTService()
llm_service = GroqLLMService()
tts_service = CartesiaTTSService()

# Audio Quality Metrics
audio_metrics_service = create_audio_metrics_service(sample_rate=16000)

logger.info("✅ Voice services initialized")


async def handle_voice_session(websocket: WebSocket, session_id: str):
    """
    Handle voice session with streaming responses.
    
    Features:
    - Audio quality metrics
    - Streaming LLM responses  
    - Sentence-by-sentence TTS
    """
    session = VoiceSessionStreaming(
        session_id=session_id,
        websocket=websocket,
        stt_service=stt_service,
        llm_service=llm_service,
        tts_service=tts_service,
        audio_metrics_service=audio_metrics_service
    )
    
    logger.info(f"🎙️ Session started: {session_id}")
    
    try:
        await session.send_state_update("listening")
        
        async for message in websocket.iter_bytes():
            try:
                if len(message) > 100:
                    await session.process_audio_chunk(message)
            except Exception as e:
                logger.error(f"Chunk error: {e}")
                await session.send_state_update("listening")
            
    except Exception as e:
        logger.error(f"Session error: {e}", exc_info=True)
        try:
            await session.send_error(str(e))
        except:
            pass
    finally:
        logger.info(f"🔌 Session ended: {session_id}")
        await session.cleanup()
