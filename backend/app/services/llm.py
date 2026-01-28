import httpx
import logging
import json
from typing import List, Dict, AsyncGenerator, Optional, Tuple
from dataclasses import dataclass
from app.config import settings

logger = logging.getLogger(__name__)


# Tool definitions for function calling
SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": "Search the web for current information, news, facts, or anything that requires up-to-date knowledge. Use this when the user asks about recent events, current facts, or anything you're not certain about.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query to find relevant information"
                }
            },
            "required": ["query"]
        }
    }
}


@dataclass
class ToolCall:
    """Represents a function call from the LLM"""
    name: str
    arguments: Dict


class GroqLLMService:
    """Groq LLM Service with streaming and function calling support"""
    
    def __init__(self, fast_mode: bool = True):
        self.api_key = settings.GROQ_API_KEY
        self.base_url = "https://api.groq.com/openai/v1"
        # Use faster model for lower latency (8B instant vs 70B versatile)
        self.model = "llama-3.1-8b-instant" if fast_mode else "llama-3.3-70b-versatile"
        self.fast_mode = fast_mode
        
    async def complete(self, messages: List[Dict[str, str]]) -> str:
        """Non-streaming completion (for compatibility)"""
        if not self.api_key:
            logger.warning("Groq API key not set, using mock response")
            return "This is a mock response. Please set GROQ_API_KEY to enable AI responses."
        
        try:
            # Add system message if not present
            if not messages or messages[0].get("role") != "system":
                messages = [
                    {
                        "role": "system",
                        "content": "You are a helpful voice assistant. Keep responses concise and natural for voice conversation. Respond in 1-3 sentences unless more detail is requested."
                    }
                ] + messages
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                }
                
                payload = {
                    "model": self.model,
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": 500
                }
                
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload
                )
                
                response.raise_for_status()
                result = response.json()
                
                content = result.get("choices", [{}])[0]\
                    .get("message", {}).get("content", "")
                
                return content.strip()
                
        except Exception as e:
            logger.error(f"Groq LLM error: {e}", exc_info=True)
            return ""
    
    async def detect_search_needed(self, user_message: str) -> Tuple[bool, Optional[str]]:
        """
        Detect if web search is needed using keyword matching and LLM.
        
        Returns:
            Tuple of (needs_search, search_query)
        """
        if not self.api_key:
            return False, None
        
        # Fast keyword check first
        search_keywords = [
            "latest", "news", "current", "today", "recent", "now",
            "happening", "update", "2024", "2025", "2026",
            "what's going on", "weather", "stock", "price",
            "who won", "score", "event", "announcement"
        ]
        
        message_lower = user_message.lower()
        keyword_match = any(kw in message_lower for kw in search_keywords)
        
        if not keyword_match:
            logger.info("📚 No search keywords - using knowledge")
            return False, None
        
        # Use LLM to decide and generate search query
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                }
                
                messages = [
                    {
                        "role": "system",
                        "content": """You decide if a web search is needed and generate the search query.

Respond in this EXACT format:
SEARCH: YES or NO
QUERY: <search query if YES, otherwise empty>

Use YES when the user asks about:
- Current events, news, recent happenings
- Specific facts that require up-to-date information
- Local events, weather, prices, scores
- Anything dated (this year, today, recently)

Use NO when:
- General knowledge questions
- Opinions or creative content
- Simple math or logic
- Casual conversation"""
                    },
                    {"role": "user", "content": user_message}
                ]
                
                payload = {
                    "model": self.model,
                    "messages": messages,
                    "temperature": 0.1,
                    "max_tokens": 100
                }
                
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload
                )
                
                response.raise_for_status()
                result = response.json()
                
                content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                
                # Parse response
                lines = content.strip().split('\n')
                needs_search = False
                search_query = user_message
                
                for line in lines:
                    if line.upper().startswith("SEARCH:"):
                        needs_search = "YES" in line.upper()
                    elif line.upper().startswith("QUERY:"):
                        query = line.split(":", 1)[1].strip()
                        if query:
                            search_query = query
                
                if needs_search:
                    logger.info(f"🔍 Search needed: '{search_query}'")
                else:
                    logger.info("📚 No search needed - using knowledge")
                
                return needs_search, search_query if needs_search else None
                
        except Exception as e:
            logger.error(f"Search detection error: {e}", exc_info=True)
            # Fallback: use keyword match result
            if keyword_match:
                logger.info(f"🔍 Fallback search triggered by keywords")
                return True, user_message
            return False, None
    
    async def stream_complete(self, messages: List[Dict[str, str]]) -> AsyncGenerator[str, None]:
        """Streaming completion - yields tokens as they're generated"""
        if not self.api_key:
            yield "This is a mock response. Please set GROQ_API_KEY."
            return
        
        try:
            if not messages or messages[0].get("role") != "system":
                messages = [
                    {
                        "role": "system",
                        "content": "You are a helpful voice assistant. Keep responses concise and natural for voice conversation. Respond in 1-3 sentences unless more detail is requested."
                    }
                ] + messages
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                }
                
                payload = {
                    "model": self.model,
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": 500,
                    "stream": True
                }
                
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload
                ) as response:
                    response.raise_for_status()
                    
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:]
                            if data == "[DONE]":
                                break
                            
                            try:
                                chunk = json.loads(data)
                                delta = chunk.get("choices", [{}])[0].get("delta", {})
                                if "content" in delta:
                                    yield delta["content"]
                            except:
                                continue
                                
        except Exception as e:
            logger.error(f"Groq streaming error: {e}", exc_info=True)
            yield ""
    
    async def stream_complete_with_context(
        self, 
        messages: List[Dict[str, str]], 
        search_context: str = "",
        citation: str = ""
    ) -> AsyncGenerator[str, None]:
        """Streaming completion with optional search context."""
        if not self.api_key:
            yield "This is a mock response. Please set GROQ_API_KEY."
            return
        
        try:
            # Build system message with search context
            system_content = "You are a helpful voice assistant. Keep responses concise and natural for voice conversation."
            
            if search_context:
                system_content += f"""

You have access to the following web search results. Use this information to answer the user's question accurately.
{search_context}

When answering:
1. Use the search results to provide accurate, current information
2. Keep your response concise (2-4 sentences for voice)
3. Start with the key answer, then add brief context if needed
4. {citation} (mention this naturally at the start or end of your response)"""
            
            if not messages or messages[0].get("role") != "system":
                messages = [{"role": "system", "content": system_content}] + messages
            else:
                messages[0]["content"] = system_content
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                }
                
                payload = {
                    "model": self.model,
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": 500,
                    "stream": True
                }
                
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload
                ) as response:
                    response.raise_for_status()
                    
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:]
                            if data == "[DONE]":
                                break
                            
                            try:
                                chunk = json.loads(data)
                                delta = chunk.get("choices", [{}])[0].get("delta", {})
                                if "content" in delta:
                                    yield delta["content"]
                            except:
                                continue
                                
        except Exception as e:
            logger.error(f"Groq streaming with context error: {e}", exc_info=True)
            yield ""
