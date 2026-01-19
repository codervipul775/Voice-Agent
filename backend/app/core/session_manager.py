"""
Session Manager - Redis-backed Session State Management

Handles multi-user session isolation, conversation history, and TTL.
"""
import uuid
import time
import json
import logging
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict
from app.core.redis import redis_manager

logger = logging.getLogger(__name__)


@dataclass
class SessionData:
    """Session data structure."""
    session_id: str
    user_id: str
    created_at: float
    last_activity: float
    state: str  # idle, listening, thinking, speaking
    conversation_history: List[Dict[str, str]]
    metadata: Dict[str, Any]
    
    def to_dict(self) -> Dict:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'SessionData':
        return cls(**data)


class SessionManager:
    """
    Manages voice sessions with Redis backing.
    
    Features:
    - Session creation with unique IDs
    - Conversation history persistence
    - Session TTL and expiration
    - Multi-user isolation
    """
    
    # Key prefixes
    SESSION_PREFIX = "session:"
    USER_SESSIONS_PREFIX = "user_sessions:"
    
    # Default TTL (30 minutes)
    DEFAULT_TTL = 1800
    
    def __init__(self, ttl: int = None):
        self.ttl = ttl or self.DEFAULT_TTL
    
    def _session_key(self, session_id: str) -> str:
        """Get Redis key for session."""
        return f"{self.SESSION_PREFIX}{session_id}"
    
    def _user_sessions_key(self, user_id: str) -> str:
        """Get Redis key for user's session list."""
        return f"{self.USER_SESSIONS_PREFIX}{user_id}"
    
    async def create_session(
        self, 
        user_id: str = None,
        session_id: str = None,
        metadata: Dict[str, Any] = None
    ) -> SessionData:
        """
        Create a new session.
        
        Args:
            user_id: User ID (auto-generated if not provided)
            session_id: Session ID (auto-generated if not provided)
            metadata: Optional session metadata
            
        Returns:
            SessionData object
        """
        session_id = session_id or str(uuid.uuid4())
        user_id = user_id or f"guest_{str(uuid.uuid4())[:8]}"
        now = time.time()
        
        session = SessionData(
            session_id=session_id,
            user_id=user_id,
            created_at=now,
            last_activity=now,
            state="idle",
            conversation_history=[],
            metadata=metadata or {}
        )
        
        # Store session in Redis
        await redis_manager.json_set(
            self._session_key(session_id),
            session.to_dict(),
            ttl=self.ttl
        )
        
        # Add to user's session list
        user_sessions = await self.get_user_sessions(user_id)
        user_sessions.append(session_id)
        await redis_manager.json_set(
            self._user_sessions_key(user_id),
            user_sessions,
            ttl=self.ttl * 2  # Keep user index longer
        )
        
        logger.info(f"✅ Session created: {session_id} for user {user_id}")
        return session
    
    async def get_session(self, session_id: str) -> Optional[SessionData]:
        """
        Get session by ID.
        
        Returns:
            SessionData if found, None otherwise
        """
        data = await redis_manager.json_get(self._session_key(session_id))
        if data:
            return SessionData.from_dict(data)
        return None
    
    async def update_session(
        self,
        session_id: str,
        state: str = None,
        add_message: Dict[str, str] = None,
        metadata: Dict[str, Any] = None
    ) -> Optional[SessionData]:
        """
        Update session data.
        
        Args:
            session_id: Session ID
            state: New state (listening, thinking, speaking)
            add_message: Message to add to history
            metadata: Metadata to merge
            
        Returns:
            Updated SessionData
        """
        session = await self.get_session(session_id)
        if not session:
            logger.warning(f"Session not found: {session_id}")
            return None
        
        # Update fields
        session.last_activity = time.time()
        
        if state:
            session.state = state
        
        if add_message:
            session.conversation_history.append(add_message)
        
        if metadata:
            session.metadata.update(metadata)
        
        # Save back to Redis
        await redis_manager.json_set(
            self._session_key(session_id),
            session.to_dict(),
            ttl=self.ttl
        )
        
        return session
    
    async def delete_session(self, session_id: str) -> bool:
        """Delete a session."""
        session = await self.get_session(session_id)
        if not session:
            return False
        
        # Remove from user's session list
        user_sessions = await self.get_user_sessions(session.user_id)
        if session_id in user_sessions:
            user_sessions.remove(session_id)
            await redis_manager.json_set(
                self._user_sessions_key(session.user_id),
                user_sessions,
                ttl=self.ttl * 2
            )
        
        # Delete session
        result = await redis_manager.delete(self._session_key(session_id))
        logger.info(f"🗑️ Session deleted: {session_id}")
        return result
    
    async def get_user_sessions(self, user_id: str) -> List[str]:
        """Get all session IDs for a user."""
        sessions = await redis_manager.json_get(self._user_sessions_key(user_id))
        return sessions or []
    
    async def list_active_sessions(self) -> List[str]:
        """List all active session IDs."""
        keys = await redis_manager.keys(f"{self.SESSION_PREFIX}*")
        return [k.replace(self.SESSION_PREFIX, "") for k in keys]
    
    async def get_session_count(self) -> int:
        """Get count of active sessions."""
        keys = await redis_manager.keys(f"{self.SESSION_PREFIX}*")
        return len(keys)
    
    async def cleanup_expired(self) -> int:
        """
        Cleanup expired sessions (Redis handles this via TTL, 
        but this is useful for in-memory fallback).
        
        Returns count of deleted sessions.
        """
        # For Redis, TTL handles expiration automatically
        # This is mainly for the in-memory fallback
        count = 0
        sessions = await self.list_active_sessions()
        now = time.time()
        
        for session_id in sessions:
            session = await self.get_session(session_id)
            if session and (now - session.last_activity) > self.ttl:
                await self.delete_session(session_id)
                count += 1
        
        if count > 0:
            logger.info(f"🧹 Cleaned up {count} expired sessions")
        
        return count
    
    async def extend_session(self, session_id: str) -> bool:
        """Extend session TTL by updating last_activity."""
        session = await self.get_session(session_id)
        if not session:
            return False
        
        session.last_activity = time.time()
        await redis_manager.json_set(
            self._session_key(session_id),
            session.to_dict(),
            ttl=self.ttl
        )
        return True


# Singleton instance
session_manager = SessionManager()


async def get_session_manager() -> SessionManager:
    """Get session manager instance."""
    return session_manager
