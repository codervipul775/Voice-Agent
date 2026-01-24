"""
WebSocket Handler for Voice Sessions
"""
from fastapi import WebSocket
import logging
import json
from app.core.session_streaming import VoiceSessionStreaming
from app.core.session_manager import session_manager
from app.services.stt import DeepgramSTTService
from app.services.llm import GroqLLMService
from app.services.tts import CartesiaTTSService
from app.services.audio_metrics import create_audio_metrics_service
from app.services.vad import create_vad_service

# Provider fallback imports
from app.services.stt_assemblyai import AssemblyAISTTService
from app.services.openai_providers import OpenAILLMService, OpenAITTSService
from app.core.provider_manager import (
    get_stt_manager, get_llm_manager, get_tts_manager,
    DeepgramSTTProvider, AssemblyAISTTProvider,
    GroqLLMProvider, OpenAILLMProvider,
    CartesiaTTSProvider, OpenAITTSProvider
)

logger = logging.getLogger(__name__)

# Initialize primary services
stt_service = DeepgramSTTService()
llm_service = GroqLLMService()
tts_service = CartesiaTTSService()

# Initialize backup services
assemblyai_stt = AssemblyAISTTService()
openai_llm = OpenAILLMService()
openai_tts = OpenAITTSService()

# Register providers with managers
# STT Providers (Deepgram primary, AssemblyAI backup)
stt_manager = get_stt_manager()
stt_manager.register(DeepgramSTTProvider(stt_service))
if assemblyai_stt.api_key:
    stt_manager.register(AssemblyAISTTProvider(assemblyai_stt))

# LLM Providers (Groq primary, OpenAI backup)
llm_manager = get_llm_manager()
llm_manager.register(GroqLLMProvider(llm_service))
if openai_llm.api_key:
    llm_manager.register(OpenAILLMProvider(openai_llm))

# TTS Providers (Cartesia primary, OpenAI backup)
tts_manager = get_tts_manager()
tts_manager.register(CartesiaTTSProvider(tts_service))
if openai_tts.api_key:
    tts_manager.register(OpenAITTSProvider(openai_tts))

# Audio Quality Metrics
audio_metrics_service = create_audio_metrics_service(sample_rate=16000)

# Voice Activity Detection
vad_service = create_vad_service(aggressiveness=2)

logger.info("✅ Voice services initialized with provider fallback")


async def handle_voice_session(websocket: WebSocket, session_id: str, user_id: str = None):
    """
    Handle voice session with streaming responses.
    
    Features:
    - Audio quality metrics
    - Streaming LLM responses  
    - Sentence-by-sentence TTS
    - Multi-user session isolation
    - Barge-in interrupt support
    
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
        
        # Handle both binary (audio) and text (JSON control) messages
        while True:
            try:
                message = await websocket.receive()
                
                if message["type"] == "websocket.disconnect":
                    break
                
                # Handle text messages (JSON control commands)
                if "text" in message:
                    try:
                        data = json.loads(message["text"])
                        msg_type = data.get("type")
                        
                        if msg_type == "interrupt":
                            logger.info("🛑 Interrupt command received")
                            await session.handle_interrupt()
                            continue
                        
                        if msg_type == "cancel_audio":
                            logger.info("🔇 Cancel audio command received")
                            await session.handle_interrupt()
                            continue
                        
                        logger.debug(f"Unknown message type: {msg_type}")
                        
                    except json.JSONDecodeError:
                        logger.warning("Invalid JSON message received")
                    continue
                
                # Handle binary messages (audio data)
                if "bytes" in message:
                    audio_data = message["bytes"]
                    if len(audio_data) > 100:
                        # Reset interrupt flag when new audio comes in
                        session.reset_interrupt()
                        await session.process_audio_chunk(audio_data)
                
            except Exception as e:
                logger.error(f"Message error: {e}")
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
