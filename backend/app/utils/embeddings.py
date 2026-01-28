"""
Embeddings utility for semantic search and caching.
Uses sentence-transformers with a lightweight, fast model.
Falls back to hash-based matching if sentence-transformers is not available.
"""
import os
import hashlib
import numpy as np
from typing import List, Optional, Union
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)

# Check if sentence-transformers is available
EMBEDDINGS_AVAILABLE = False
_model = None
MODEL_NAME = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

try:
    from sentence_transformers import SentenceTransformer
    EMBEDDINGS_AVAILABLE = True
except ImportError:
    logger.warning("⚠️ sentence-transformers not available, using hash-based matching")


def get_model():
    """Lazy load the embedding model."""
    global _model
    if not EMBEDDINGS_AVAILABLE:
        return None
    
    if _model is None:
        try:
            logger.info(f"🔄 Loading embedding model: {MODEL_NAME}")
            _model = SentenceTransformer(MODEL_NAME)
            logger.info(f"✅ Embedding model loaded: {MODEL_NAME}")
        except Exception as e:
            logger.error(f"❌ Failed to load embedding model: {e}")
            return None
    return _model


def get_embedding(text: str) -> List[float]:
    """
    Get embedding vector for a single text.
    Falls back to hash-based pseudo-embedding if model not available.
    """
    model = get_model()
    if model is None:
        # Fallback: create a simple hash-based pseudo-embedding
        # This won't give semantic similarity, but allows the system to work
        hash_val = hashlib.sha256(text.lower().strip().encode()).hexdigest()
        # Convert hash to a list of floats (fake embedding)
        return [float(int(hash_val[i:i+2], 16)) / 255.0 for i in range(0, 64, 2)]
    
    embedding = model.encode(text, convert_to_numpy=True)
    return embedding.tolist()


def get_embeddings(texts: List[str]) -> List[List[float]]:
    """Get embedding vectors for multiple texts."""
    return [get_embedding(text) for text in texts]


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """
    Calculate cosine similarity between two vectors.
    """
    a = np.array(vec1)
    b = np.array(vec2)
    
    dot_product = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    
    if norm_a == 0 or norm_b == 0:
        return 0.0
    
    return float(dot_product / (norm_a * norm_b))


def find_most_similar(
    query_embedding: List[float],
    candidate_embeddings: List[List[float]],
    top_k: int = 5,
    threshold: float = 0.0
) -> List[tuple]:
    """Find the most similar embeddings to a query."""
    similarities = []
    
    for i, candidate in enumerate(candidate_embeddings):
        sim = cosine_similarity(query_embedding, candidate)
        if sim >= threshold:
            similarities.append((i, sim))
    
    similarities.sort(key=lambda x: x[1], reverse=True)
    return similarities[:top_k]


def preload_model():
    """Preload the model at startup to avoid cold start latency."""
    if not EMBEDDINGS_AVAILABLE:
        logger.info("⚠️ Embeddings not available, skipping preload")
        return
    try:
        get_model()
        logger.info("✅ Embedding model preloaded")
    except Exception as e:
        logger.warning(f"⚠️ Could not preload embedding model: {e}")
