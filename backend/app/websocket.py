"""
WebSocket Handler for Voice Sessions
"""
from fastapi import WebSocket
import logging
from app.core.session_streaming import VoiceSessionStreaming
from app.core.session_manager import session_manager
from app.services.stt import DeepgramSTTService
from app.services.llm import GroqLLMService
from app.services.tts import CartesiaTTSService
from app.services.audio_metrics import create_audio_metrics_service
from app.services.vad import create_vad_service

logger = logging.getLogger(__name__)

# Initialize services (singleton)
stt_service = DeepgramSTTService()
llm_service = GroqLLMService()
tts_service = CartesiaTTSService()

# Audio Quality Metrics
audio_metrics_service = create_audio_metrics_service(sample_rate=16000)

# Voice Activity Detection
vad_service = create_vad_service(aggressiveness=2)

logger.info("✅ Voice services initialized")


async def handle_voice_session(websocket: WebSocket, session_id: str, user_id: str = None):
    """
    Handle voice session with streaming responses.
    
    Features:
    - Audio quality metrics
    - Streaming LLM responses  
    - Sentence-by-sentence TTS
    - Multi-user session isolation
    
    Args:
        websocket: WebSocket connection
        session_id: Unique session identifier
        user_id: User identifier for session ownership
    """
    # Load conversation history from session if available
    stored_session = await session_manager.get_session(session_id)
    previous_history = stored_session.conversation_history if stored_session else []
    
    session = VoiceSessionStreaming(
        session_id=session_id,
        websocket=websocket,
        stt_service=stt_service,
        llm_service=llm_service,
        tts_service=tts_service,
        audio_metrics_service=audio_metrics_service,
        vad_service=vad_service,
        user_id=user_id,
        initial_history=previous_history
    )
    
    logger.info(f"🎙️ Session started: {session_id} (user: {user_id})")
    
    try:
        await session.send_state_update("listening")
        
        # Update session state to listening
        await session_manager.update_session(session_id, state="listening")
        
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
        
        # Save conversation history to Redis before cleanup
        if session.conversation_history:
            await session_manager.update_session(
                session_id, 
                state="idle",
                metadata={"last_history_count": len(session.conversation_history)}
            )
            # Update with each message
            for msg in session.conversation_history:
                if stored_session and msg not in stored_session.conversation_history:
                    await session_manager.update_session(session_id, add_message=msg)
        
        await session.cleanup()

