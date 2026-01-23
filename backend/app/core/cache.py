"""
Semantic Cache for LLM responses.
Uses embeddings to find similar cached queries and avoid redundant LLM calls.
"""
import json
import logging
import hashlib
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple
from app.core.redis import get_redis
from app.utils.embeddings import get_embedding, cosine_similarity

logger = logging.getLogger(__name__)

# Cache key prefixes
CACHE_PREFIX = "sem_cache:"
EMBEDDING_PREFIX = "sem_emb:"
INDEX_KEY = "sem_cache:index"


class SemanticCache:
    """
    Semantic cache using embeddings for similarity matching.
    Stores LLM responses and retrieves them for similar queries.
    """
    
    def __init__(
        self,
        similarity_threshold: float = 0.85,
        default_ttl: int = 3600  # 1 hour default
    ):
        self.similarity_threshold = similarity_threshold
        self.default_ttl = default_ttl
        self._stats = {"hits": 0, "misses": 0}
    
    def _get_cache_key(self, query: str) -> str:
        """Generate a unique cache key from query text."""
        hash_obj = hashlib.sha256(query.encode())
        return f"{CACHE_PREFIX}{hash_obj.hexdigest()[:16]}"
    
    def _classify_query_type(self, query: str) -> Tuple[str, int]:
        """
        Classify query type and return appropriate TTL.
        
        Returns:
            Tuple of (query_type, ttl_seconds)
        """
        query_lower = query.lower()
        
        # Time-sensitive queries (short TTL)
        if any(word in query_lower for word in ["weather", "time", "today", "now", "current", "latest"]):
            return "temporal", 300  # 5 minutes
        
        # Search-based queries (medium TTL)
        if any(word in query_lower for word in ["news", "happened", "recent", "update"]):
            return "search", 900  # 15 minutes
        
        # Factual/knowledge queries (long TTL)
        if any(word in query_lower for word in ["what is", "who is", "how to", "explain", "define"]):
            return "knowledge", 7200  # 2 hours
        
        # Default (medium TTL)
        return "general", self.default_ttl
    
    async def get(self, query: str) -> Optional[Dict[str, Any]]:
        """
        Try to get a cached response for a semantically similar query.
        
        Args:
            query: The user's query text
            
        Returns:
            Cached response dict with 'response' and 'metadata', or None if not found
        """
        redis = await get_redis()
        if not redis:
            return None
        
        try:
            # Get query embedding
            query_embedding = get_embedding(query)
            
            # Get all cached embeddings from index
            cached_keys = await redis.smembers(INDEX_KEY)
            if not cached_keys:
                self._stats["misses"] += 1
                return None
            
            best_match = None
            best_similarity = 0.0
            
            for key in cached_keys:
                key_str = key.decode() if isinstance(key, bytes) else key
                
                # Get cached embedding
                emb_key = f"{EMBEDDING_PREFIX}{key_str}"
                cached_emb_json = await redis.get(emb_key)
                
                if not cached_emb_json:
                    continue
                
                cached_embedding = json.loads(cached_emb_json)
                similarity = cosine_similarity(query_embedding, cached_embedding)
                
                if similarity > best_similarity and similarity >= self.similarity_threshold:
                    best_similarity = similarity
                    best_match = key_str
            
            if best_match:
                # Retrieve cached response
                cache_key = f"{CACHE_PREFIX}{best_match}"
                cached_data = await redis.get(cache_key)
                
                if cached_data:
                    self._stats["hits"] += 1
                    data = json.loads(cached_data)
                    logger.info(f"🎯 Cache HIT (similarity={best_similarity:.3f}): {query[:50]}...")
                    return {
                        "response": data["response"],
                        "metadata": {
                            "cached": True,
                            "similarity": round(best_similarity, 3),
                            "original_query": data.get("query", ""),
                            "cached_at": data.get("cached_at", "")
                        }
                    }
            
            self._stats["misses"] += 1
            logger.debug(f"❌ Cache MISS: {query[:50]}...")
            return None
            
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            self._stats["misses"] += 1
            return None
    
    async def set(
        self,
        query: str,
        response: str,
        ttl: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Cache a response for a query.
        
        Args:
            query: The user's query text
            response: The LLM response to cache
            ttl: Time-to-live in seconds (auto-determined if not provided)
            metadata: Additional metadata to store
            
        Returns:
            True if cached successfully
        """
        redis = await get_redis()
        if not redis:
            return False
        
        try:
            # Auto-classify if no TTL provided
            if ttl is None:
                query_type, ttl = self._classify_query_type(query)
                logger.debug(f"Query type: {query_type}, TTL: {ttl}s")
            
            # Generate cache key
            key_hash = hashlib.sha256(query.encode()).hexdigest()[:16]
            cache_key = f"{CACHE_PREFIX}{key_hash}"
            emb_key = f"{EMBEDDING_PREFIX}{key_hash}"
            
            # Get embedding
            embedding = get_embedding(query)
            
            # Store response
            cache_data = {
                "query": query,
                "response": response,
                "cached_at": datetime.utcnow().isoformat(),
                "metadata": metadata or {}
            }
            
            # Set cache with TTL (using set with ttl parameter)
            await redis.set(cache_key, json.dumps(cache_data), ttl=ttl)
            await redis.set(emb_key, json.dumps(embedding), ttl=ttl)
            
            # Add to index
            await redis.sadd(INDEX_KEY, key_hash)
            
            logger.info(f"💾 Cached response (TTL={ttl}s): {query[:50]}...")
            return True
            
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            return False
    
    async def invalidate(self, query: str) -> bool:
        """Invalidate a specific cached query."""
        redis = await get_redis()
        if not redis:
            return False
        
        try:
            key_hash = hashlib.sha256(query.encode()).hexdigest()[:16]
            cache_key = f"{CACHE_PREFIX}{key_hash}"
            emb_key = f"{EMBEDDING_PREFIX}{key_hash}"
            
            await redis.delete(cache_key)
            await redis.delete(emb_key)
            await redis.srem(INDEX_KEY, key_hash)
            
            logger.info(f"🗑️ Invalidated cache: {query[:50]}...")
            return True
            
        except Exception as e:
            logger.error(f"Cache invalidate error: {e}")
            return False
    
    async def clear(self) -> int:
        """Clear all cached entries."""
        redis = await get_redis()
        if not redis:
            return 0
        
        try:
            # Get all keys to delete
            keys = await redis.smembers(INDEX_KEY)
            deleted = 0
            
            for key in keys:
                key_str = key if isinstance(key, str) else str(key)
                await redis.delete(f"{CACHE_PREFIX}{key_str}")
                await redis.delete(f"{EMBEDDING_PREFIX}{key_str}")
                deleted += 1
            
            await redis.delete(INDEX_KEY)
            self._stats = {"hits": 0, "misses": 0}
            
            logger.info(f"🧹 Cleared {deleted} cached entries")
            return deleted
            
        except Exception as e:
            logger.error(f"Cache clear error: {e}")
            return 0
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache hit/miss statistics."""
        total = self._stats["hits"] + self._stats["misses"]
        hit_rate = (self._stats["hits"] / total * 100) if total > 0 else 0
        return {
            "hits": self._stats["hits"],
            "misses": self._stats["misses"],
            "total": total,
            "hit_rate": f"{hit_rate:.1f}%"
        }


# Global cache instance
_semantic_cache: Optional[SemanticCache] = None


async def get_semantic_cache() -> SemanticCache:
    """Get the global semantic cache instance."""
    global _semantic_cache
    if _semantic_cache is None:
        _semantic_cache = SemanticCache()
    return _semantic_cache
