"""
Embeddings utility for semantic search and caching.
Uses sentence-transformers with a lightweight, fast model.
"""
import os
import numpy as np
from typing import List, Optional, Union
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)

# Lazy loading for the model
_model = None
MODEL_NAME = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")


def get_model():
    """Lazy load the embedding model."""
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer
            logger.info(f"🔄 Loading embedding model: {MODEL_NAME}")
            _model = SentenceTransformer(MODEL_NAME)
            logger.info(f"✅ Embedding model loaded: {MODEL_NAME}")
        except Exception as e:
            logger.error(f"❌ Failed to load embedding model: {e}")
            raise
    return _model


def get_embedding(text: str) -> List[float]:
    """
    Get embedding vector for a single text.
    
    Args:
        text: Input text to embed
        
    Returns:
        List of floats representing the embedding vector
    """
    model = get_model()
    embedding = model.encode(text, convert_to_numpy=True)
    return embedding.tolist()


def get_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Get embedding vectors for multiple texts.
    
    Args:
        texts: List of input texts
        
    Returns:
        List of embedding vectors
    """
    model = get_model()
    embeddings = model.encode(texts, convert_to_numpy=True)
    return embeddings.tolist()


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """
    Calculate cosine similarity between two vectors.
    
    Args:
        vec1: First embedding vector
        vec2: Second embedding vector
        
    Returns:
        Cosine similarity score (0.0 to 1.0)
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
    """
    Find the most similar embeddings to a query.
    
    Args:
        query_embedding: Query embedding vector
        candidate_embeddings: List of candidate embedding vectors
        top_k: Number of top results to return
        threshold: Minimum similarity threshold
        
    Returns:
        List of (index, similarity_score) tuples, sorted by similarity
    """
    similarities = []
    
    for i, candidate in enumerate(candidate_embeddings):
        sim = cosine_similarity(query_embedding, candidate)
        if sim >= threshold:
            similarities.append((i, sim))
    
    # Sort by similarity (descending)
    similarities.sort(key=lambda x: x[1], reverse=True)
    
    return similarities[:top_k]


def preload_model():
    """Preload the model at startup to avoid cold start latency."""
    try:
        get_model()
        logger.info("✅ Embedding model preloaded")
    except Exception as e:
        logger.warning(f"⚠️ Could not preload embedding model: {e}")
