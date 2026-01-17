import httpx
import logging
from typing import List, Dict, AsyncGenerator
from app.config import settings

logger = logging.getLogger(__name__)

class GroqLLMService:
    """Groq LLM Service with streaming support"""
    
    def __init__(self):
        self.api_key = settings.GROQ_API_KEY
        self.base_url = "https://api.groq.com/openai/v1"
        self.model = "llama-3.3-70b-versatile"
        
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
            
            async with httpx.AsyncClient(timeout=30.0) as client:
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
            
            async with httpx.AsyncClient(timeout=30.0) as client:
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
                                import json
                                chunk = json.loads(data)
                                delta = chunk.get("choices", [{}])[0].get("delta", {})
                                if "content" in delta:
                                    yield delta["content"]
                            except:
                                continue
                                
        except Exception as e:
            logger.error(f"Groq streaming error: {e}", exc_info=True)
            yield ""
