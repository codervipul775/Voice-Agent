"""
Cache Warmer - Preloads common queries into the semantic cache.
Runs at startup to reduce cold-start latency.
"""
import logging
from typing import List, Dict
from app.core.cache import get_semantic_cache

logger = logging.getLogger(__name__)

# Common queries to pre-cache with their responses
COMMON_QUERIES: List[Dict[str, str]] = [
    {
        "query": "Hello",
        "response": "Hello! I'm your AI voice assistant. How can I help you today?"
    },
    {
        "query": "Hi there",
        "response": "Hi! I'm here to assist you. What would you like to know?"
    },
    {
        "query": "What can you do?",
        "response": "I can answer questions, search the web for current information, help with tasks, and have natural conversations. Just ask me anything!"
    },
    {
        "query": "Who are you?",
        "response": "I'm an AI voice assistant designed to help you with information, tasks, and conversation. I can search the web for current events and answer a wide range of questions."
    },
    {
        "query": "How are you?",
        "response": "I'm doing great, thank you for asking! I'm ready to help you with whatever you need."
    },
    {
        "query": "Thank you",
        "response": "You're welcome! Is there anything else I can help you with?"
    },
    {
        "query": "Goodbye",
        "response": "Goodbye! It was nice talking with you. Have a great day!"
    },
    {
        "query": "What's your name?",
        "response": "I'm your AI voice assistant. I don't have a specific name, but you can call me whatever you like!"
    },
]


async def warm_cache(custom_queries: List[Dict[str, str]] = None) -> int:
    """
    Preload common queries into the semantic cache.
    
    Args:
        custom_queries: Optional additional queries to cache
        
    Returns:
        Number of queries cached
    """
    cache = await get_semantic_cache()
    queries_to_cache = COMMON_QUERIES.copy()
    
    if custom_queries:
        queries_to_cache.extend(custom_queries)
    
    cached_count = 0
    for item in queries_to_cache:
        try:
            success = await cache.set(
                query=item["query"],
                response=item["response"],
                ttl=86400,  # 24 hours for warm cache entries
                metadata={"source": "cache_warmer", "warm": True}
            )
            if success:
                cached_count += 1
        except Exception as e:
            logger.warning(f"Failed to cache query '{item['query'][:30]}...': {e}")
    
    logger.info(f"🔥 Cache warmed with {cached_count}/{len(queries_to_cache)} entries")
    return cached_count


async def get_warm_cache_stats() -> Dict:
    """Get statistics about warm cache entries."""
    cache = await get_semantic_cache()
    return cache.get_stats()
