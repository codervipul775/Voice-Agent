"""
Tavily Web Search Service
Provides real-time web search capabilities for the voice assistant.
"""
import httpx
import logging
from typing import List, Optional
from dataclasses import dataclass
from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    """A single search result"""
    title: str
    url: str
    content: str
    score: float = 0.0


class TavilySearchService:
    """Tavily Web Search API integration"""
    
    def __init__(self):
        self.api_key = settings.TAVILY_API_KEY
        self.base_url = "https://api.tavily.com"
        
    async def search(
        self, 
        query: str, 
        max_results: int = 3,
        search_depth: str = "basic"
    ) -> List[SearchResult]:
        """
        Perform a web search using Tavily API.
        
        Args:
            query: Search query string
            max_results: Maximum number of results to return
            search_depth: "basic" (faster) or "advanced" (more thorough)
            
        Returns:
            List of SearchResult objects
        """
        if not self.api_key:
            logger.warning("Tavily API key not set, skipping search")
            return []
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{self.base_url}/search",
                    json={
                        "api_key": self.api_key,
                        "query": query,
                        "search_depth": search_depth,
                        "max_results": max_results,
                        "include_answer": True,
                        "include_raw_content": False
                    }
                )
                
                response.raise_for_status()
                data = response.json()
                
                results = []
                for item in data.get("results", []):
                    results.append(SearchResult(
                        title=item.get("title", ""),
                        url=item.get("url", ""),
                        content=item.get("content", ""),
                        score=item.get("score", 0.0)
                    ))
                
                logger.info(f"🔍 Tavily search: '{query[:50]}...' → {len(results)} results")
                return results
                
        except httpx.TimeoutException:
            logger.error(f"Tavily search timeout for query: {query}")
            return []
        except Exception as e:
            logger.error(f"Tavily search error: {e}", exc_info=True)
            return []
    
    def format_results_for_llm(self, results: List[SearchResult]) -> str:
        """Format search results as context for the LLM."""
        if not results:
            return ""
        
        formatted = "Web Search Results:\n\n"
        for i, result in enumerate(results, 1):
            formatted += f"[{i}] {result.title}\n"
            formatted += f"Source: {result.url}\n"
            formatted += f"{result.content[:300]}...\n\n"
        
        return formatted
    
    def format_citations(self, results: List[SearchResult]) -> str:
        """Format source citations for voice response."""
        if not results:
            return ""
        
        # Voice-friendly citation format
        if len(results) == 1:
            return f"According to {self._domain_from_url(results[0].url)}"
        else:
            sources = [self._domain_from_url(r.url) for r in results[:2]]
            return f"Based on sources including {' and '.join(sources)}"
    
    def _domain_from_url(self, url: str) -> str:
        """Extract domain name for citation."""
        try:
            from urllib.parse import urlparse
            domain = urlparse(url).netloc
            # Remove www. prefix
            if domain.startswith("www."):
                domain = domain[4:]
            # Return just the main domain name
            parts = domain.split(".")
            if len(parts) >= 2:
                return parts[-2].title()
            return domain
        except:
            return "web sources"


# Singleton instance
search_service = TavilySearchService()
