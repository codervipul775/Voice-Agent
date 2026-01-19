"""
Authentication Module - Simple Token-Based Auth

Provides JWT token generation and validation for WebSocket auth.
"""
import os
import time
import logging
from typing import Optional
from datetime import datetime, timedelta
import jwt
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Configuration
JWT_SECRET = os.getenv("JWT_SECRET_KEY", "voice-assistant-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24


@dataclass
class TokenPayload:
    """JWT token payload."""
    user_id: str
    exp: float  # Expiration timestamp
    iat: float  # Issued at timestamp
    
    def is_expired(self) -> bool:
        return time.time() > self.exp


def create_token(user_id: str, expiry_hours: int = None) -> str:
    """
    Create a JWT token for a user.
    
    Args:
        user_id: User identifier
        expiry_hours: Token expiry in hours (default: 24)
        
    Returns:
        JWT token string
    """
    expiry = expiry_hours or JWT_EXPIRY_HOURS
    now = time.time()
    
    payload = {
        "user_id": user_id,
        "exp": now + (expiry * 3600),
        "iat": now
    }
    
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    logger.debug(f"🔑 Token created for user: {user_id}")
    return token


def validate_token(token: str) -> Optional[TokenPayload]:
    """
    Validate a JWT token.
    
    Args:
        token: JWT token string
        
    Returns:
        TokenPayload if valid, None otherwise
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        token_data = TokenPayload(
            user_id=payload["user_id"],
            exp=payload["exp"],
            iat=payload["iat"]
        )
        
        if token_data.is_expired():
            logger.warning("🚫 Token expired")
            return None
        
        return token_data
        
    except jwt.ExpiredSignatureError:
        logger.warning("🚫 Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"🚫 Invalid token: {e}")
        return None


def get_user_from_token(token: str) -> Optional[str]:
    """
    Get user ID from token.
    
    Args:
        token: JWT token string
        
    Returns:
        User ID if valid, None otherwise
    """
    payload = validate_token(token)
    return payload.user_id if payload else None


def create_guest_token() -> tuple[str, str]:
    """
    Create a guest token with auto-generated user ID.
    
    Returns:
        Tuple of (token, user_id)
    """
    import uuid
    user_id = f"guest_{str(uuid.uuid4())[:8]}"
    token = create_token(user_id)
    return token, user_id


async def authenticate_websocket(token: str = None) -> Optional[str]:
    """
    Authenticate WebSocket connection.
    
    Args:
        token: JWT token from query param or first message
        
    Returns:
        User ID if authenticated, None otherwise
    """
    if not token:
        # Allow guest access - create guest token
        _, user_id = create_guest_token()
        logger.info(f"👤 Guest user created: {user_id}")
        return user_id
    
    user_id = get_user_from_token(token)
    if user_id:
        logger.info(f"✅ User authenticated: {user_id}")
        return user_id
    
    return None
