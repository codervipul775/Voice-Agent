from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from app.websocket import handle_voice_session
from app.config import settings
from app.core.redis import redis_manager
from app.core.session_manager import session_manager
from app.core.auth import create_token, create_guest_token, authenticate_websocket
from app.core.tasks import background_tasks
from app.services.metrics import metrics_collector
import logging
import asyncio

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
    version="2.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response models
class TokenRequest(BaseModel):
    user_id: Optional[str] = None

class TokenResponse(BaseModel):
    token: str
    user_id: str
    expires_in: int = 86400  # 24 hours


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "voice-assistant",
        "version": "2.0.0"
    }


@app.get("/health")
async def health():
    """Detailed health check including Redis"""
    redis_health = await redis_manager.health_check()
    session_count = await session_manager.get_session_count()
    
    return {
        "status": "healthy",
        "services": {
            "stt": "operational",
            "llm": "operational",
            "tts": "operational",
            "redis": redis_health
        },
        "sessions": {
            "active": session_count
        }
    }


@app.get("/metrics")
async def get_metrics():
    """Get current metrics snapshot"""
    # Update active sessions count
    session_count = await session_manager.get_session_count()
    metrics_collector.set_active_sessions(session_count)
    
    return metrics_collector.get_stats()


@app.get("/metrics/recent")
async def get_recent_metrics(limit: int = 10):
    """Get recent request details"""
    return {
        "requests": metrics_collector.get_recent_requests(limit)
    }


@app.websocket("/metrics/ws")
async def metrics_websocket(websocket: WebSocket):
    """Real-time metrics WebSocket - pushes updates every second"""
    await websocket.accept()
    logger.info("📊 Metrics WebSocket connected")
    
    try:
        while True:
            # Update active sessions
            session_count = await session_manager.get_session_count()
            metrics_collector.set_active_sessions(session_count)
            
            # Send metrics
            stats = metrics_collector.get_stats()
            stats["recent_requests"] = metrics_collector.get_recent_requests(5)
            
            await websocket.send_json(stats)
            await asyncio.sleep(1)  # Update every second
            
    except WebSocketDisconnect:
        logger.info("📊 Metrics WebSocket disconnected")
    except Exception as e:
        logger.error(f"Metrics WebSocket error: {e}")


@app.post("/auth/token", response_model=TokenResponse)
async def get_auth_token(request: TokenRequest = None):
    """
    Get an authentication token.
    
    If user_id is provided, creates a token for that user.
    Otherwise, creates a guest token.
    """
    if request and request.user_id:
        token = create_token(request.user_id)
        return TokenResponse(token=token, user_id=request.user_id)
    else:
        token, user_id = create_guest_token()
        return TokenResponse(token=token, user_id=user_id)


@app.get("/sessions")
async def list_sessions():
    """List all active sessions (admin endpoint)."""
    sessions = await session_manager.list_active_sessions()
    return {
        "count": len(sessions),
        "sessions": sessions
    }


@app.delete("/sessions/cleanup")
async def cleanup_all_sessions():
    """Delete all sessions and reset metrics (admin endpoint)."""
    sessions = await session_manager.list_active_sessions()
    deleted = 0
    for session in sessions:
        await session_manager.delete_session(session["session_id"])
        deleted += 1
    
    # Reset metrics collector
    metrics_collector.total_requests = 0
    metrics_collector.successful_requests = 0
    metrics_collector.failed_requests = 0
    metrics_collector.metrics_history.clear()
    metrics_collector._in_flight.clear()
    
    return {
        "message": f"Cleaned up {deleted} sessions and reset metrics",
        "deleted_count": deleted
    }


@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """Get session details."""
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.to_dict()


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a session."""
    result = await session_manager.delete_session(session_id)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session deleted", "session_id": session_id}


@app.websocket("/voice/{session_id}")
async def voice_endpoint(
    websocket: WebSocket, 
    session_id: str,
    token: Optional[str] = Query(None)
):
    """
    Main WebSocket endpoint for voice conversations.
    
    Args:
        session_id: Unique session identifier
        token: Optional auth token (query param)
    """
    await websocket.accept()
    
    # Authenticate user (allows guest if no token)
    user_id = await authenticate_websocket(token)
    logger.info(f"WebSocket connection established: {session_id} (user: {user_id})")
    
    # Create or get session in SessionManager
    session = await session_manager.get_session(session_id)
    if not session:
        session = await session_manager.create_session(
            user_id=user_id,
            session_id=session_id
        )
    
    try:
        await handle_voice_session(websocket, session_id, user_id)
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {session_id}")
    except Exception as e:
        logger.error(f"Error in voice session {session_id}: {e}")
        await websocket.close()
    finally:
        # Update session on disconnect (don't delete - keep for reconnect)
        await session_manager.update_session(session_id, state="idle")


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("Starting Voice Assistant API...")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    
    # Connect to Redis
    redis_url = settings.REDIS_URL
    connected = await redis_manager.connect(redis_url)
    if connected:
        logger.info("✅ Redis connected")
    else:
        logger.warning("⚠️ Redis not available, using in-memory fallback")
    
    # Start background tasks
    await background_tasks.start()


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down Voice Assistant API...")
    
    # Stop background tasks
    await background_tasks.stop()
    
    # Disconnect Redis
    await redis_manager.disconnect()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
