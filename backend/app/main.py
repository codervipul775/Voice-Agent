from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.websocket import handle_voice_session
from app.config import settings
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Voice Assistant API",
    description="Production-ready voice assistant with low latency",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "voice-assistant",
        "version": "1.0.0"
    }

@app.get("/health")
async def health():
    """Detailed health check"""
    return {
        "status": "healthy",
        "services": {
            "stt": "operational",
            "llm": "operational",
            "tts": "operational"
        }
    }

@app.websocket("/voice/{session_id}")
async def voice_endpoint(websocket: WebSocket, session_id: str):
    """
    Main WebSocket endpoint for voice conversations
    
    Args:
        session_id: Unique session identifier
    """
    await websocket.accept()
    logger.info(f"WebSocket connection established: {session_id}")
    
    try:
        await handle_voice_session(websocket, session_id)
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {session_id}")
    except Exception as e:
        logger.error(f"Error in voice session {session_id}: {e}")
        await websocket.close()

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("Starting Voice Assistant API...")
    logger.info(f"Environment: {settings.ENVIRONMENT}")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down Voice Assistant API...")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
