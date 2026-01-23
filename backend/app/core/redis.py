"""
Redis Connection Manager for Upstash/Redis

Provides async Redis client with connection pooling and graceful fallback.
"""
import os
import json
import logging
from typing import Optional, Any, Dict
from redis import asyncio as aioredis

logger = logging.getLogger(__name__)


class RedisManager:
    """
    Redis connection manager with Upstash support.
    Falls back to in-memory dict if Redis unavailable.
    """
    
    _instance: Optional['RedisManager'] = None
    _client: Optional[aioredis.Redis] = None
    _fallback_store: Dict[str, Any] = {}
    _use_fallback: bool = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    async def connect(self, redis_url: Optional[str] = None) -> bool:
        """
        Connect to Redis. Returns True if connected, False if using fallback.
        """
        url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        
        try:
            self._client = aioredis.from_url(
                url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5
            )
            
            # Test connection
            await self._client.ping()
            logger.info(f"✅ Redis connected: {url[:30]}...")
            self._use_fallback = False
            return True
            
        except Exception as e:
            logger.warning(f"⚠️ Redis connection failed: {e}. Using in-memory fallback.")
            self._use_fallback = True
            self._fallback_store = {}
            return False
    
    async def disconnect(self):
        """Close Redis connection."""
        if self._client:
            await self._client.close()
            logger.info("🔌 Redis disconnected")
    
    async def health_check(self) -> Dict[str, Any]:
        """Check Redis health status."""
        if self._use_fallback:
            return {
                "status": "fallback",
                "message": "Using in-memory storage",
                "keys": len(self._fallback_store)
            }
        
        try:
            await self._client.ping()
            info = await self._client.info("memory")
            return {
                "status": "connected",
                "used_memory": info.get("used_memory_human", "unknown"),
                "connected_clients": info.get("connected_clients", 0)
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    # Key-Value Operations
    
    async def get(self, key: str) -> Optional[str]:
        """Get value by key."""
        if self._use_fallback:
            return self._fallback_store.get(key)
        return await self._client.get(key)
    
    async def set(self, key: str, value: str, ttl: Optional[int] = None) -> bool:
        """Set key with optional TTL (seconds)."""
        if self._use_fallback:
            self._fallback_store[key] = value
            return True
        return await self._client.set(key, value, ex=ttl)
    
    async def delete(self, key: str) -> bool:
        """Delete key."""
        if self._use_fallback:
            if key in self._fallback_store:
                del self._fallback_store[key]
                return True
            return False
        result = await self._client.delete(key)
        return result > 0
    
    async def exists(self, key: str) -> bool:
        """Check if key exists."""
        if self._use_fallback:
            return key in self._fallback_store
        return await self._client.exists(key) > 0
    
    async def keys(self, pattern: str = "*") -> list:
        """Get all keys matching pattern."""
        if self._use_fallback:
            import fnmatch
            return [k for k in self._fallback_store.keys() if fnmatch.fnmatch(k, pattern)]
        return await self._client.keys(pattern)
    
    async def ttl(self, key: str) -> int:
        """Get remaining TTL of key (-1 if no expiry, -2 if not exists)."""
        if self._use_fallback:
            return -1 if key in self._fallback_store else -2
        return await self._client.ttl(key)
    
    # JSON Operations (for storing complex objects)
    
    async def json_get(self, key: str) -> Optional[Dict]:
        """Get JSON object by key."""
        data = await self.get(key)
        if data:
            try:
                return json.loads(data)
            except json.JSONDecodeError:
                return None
        return None
    
    async def json_set(self, key: str, value: Dict, ttl: Optional[int] = None) -> bool:
        """Set JSON object with optional TTL."""
        return await self.set(key, json.dumps(value), ttl)
    
    # Hash Operations (for session data)
    
    async def hget(self, name: str, key: str) -> Optional[str]:
        """Get hash field."""
        if self._use_fallback:
            hash_data = self._fallback_store.get(name, {})
            return hash_data.get(key)
        return await self._client.hget(name, key)
    
    async def hset(self, name: str, key: str, value: str) -> bool:
        """Set hash field."""
        if self._use_fallback:
            if name not in self._fallback_store:
                self._fallback_store[name] = {}
            self._fallback_store[name][key] = value
            return True
        return await self._client.hset(name, key, value)
    
    async def hgetall(self, name: str) -> Dict[str, str]:
        """Get all hash fields."""
        if self._use_fallback:
            return self._fallback_store.get(name, {})
        return await self._client.hgetall(name)
    
    async def hdel(self, name: str, *keys: str) -> int:
        """Delete hash fields."""
        if self._use_fallback:
            hash_data = self._fallback_store.get(name, {})
            count = 0
            for key in keys:
                if key in hash_data:
                    del hash_data[key]
                    count += 1
            return count
        return await self._client.hdel(name, *keys)
    
    # Set Operations (for cache index)
    
    async def sadd(self, name: str, *values: str) -> int:
        """Add members to set."""
        if self._use_fallback:
            if name not in self._fallback_store:
                self._fallback_store[name] = set()
            before = len(self._fallback_store[name])
            self._fallback_store[name].update(values)
            return len(self._fallback_store[name]) - before
        return await self._client.sadd(name, *values)
    
    async def srem(self, name: str, *values: str) -> int:
        """Remove members from set."""
        if self._use_fallback:
            set_data = self._fallback_store.get(name, set())
            count = 0
            for v in values:
                if v in set_data:
                    set_data.discard(v)
                    count += 1
            return count
        return await self._client.srem(name, *values)
    
    async def smembers(self, name: str) -> set:
        """Get all members of set."""
        if self._use_fallback:
            return self._fallback_store.get(name, set())
        return await self._client.smembers(name)



# Singleton instance
redis_manager = RedisManager()


async def get_redis() -> RedisManager:
    """Get Redis manager instance."""
    return redis_manager
