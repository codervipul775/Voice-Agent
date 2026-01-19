"""
Background Tasks - Session Cleanup and Maintenance

Runs periodic cleanup of expired sessions.
"""
import asyncio
import logging
from app.core.session_manager import session_manager

logger = logging.getLogger(__name__)


class BackgroundTasks:
    """Background task runner for session maintenance."""
    
    _instance = None
    _cleanup_task = None
    _running = False
    
    # Cleanup interval (5 minutes)
    CLEANUP_INTERVAL = 300
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    async def start(self):
        """Start background tasks."""
        if self._running:
            return
        
        self._running = True
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("🔄 Background tasks started")
    
    async def stop(self):
        """Stop background tasks."""
        self._running = False
        
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        
        logger.info("⏹️ Background tasks stopped")
    
    async def _cleanup_loop(self):
        """Periodic session cleanup loop."""
        while self._running:
            try:
                # Run cleanup
                count = await session_manager.cleanup_expired()
                
                # Log session stats
                active_count = await session_manager.get_session_count()
                logger.info(f"📊 Sessions: {active_count} active, {count} cleaned up")
                
            except Exception as e:
                logger.error(f"Cleanup error: {e}")
            
            # Wait for next interval
            await asyncio.sleep(self.CLEANUP_INTERVAL)


# Singleton instance
background_tasks = BackgroundTasks()
