"""
OpenAI Services (Backup Providers)
Provides LLM and TTS fallback when primary providers are unavailable.
"""

import httpx
import logging
import json
from typing import AsyncGenerator, List, Dict, Optional
from app.config import settings

logger = logging.getLogger(__name__)


class OpenAILLMService:
    """OpenAI LLM Service - Backup provider for Groq"""
    
    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY
        self.model = "gpt-4o-mini"  # Fast and cost-effective
        self.base_url = "https://api.openai.com/v1"
        
        if self.api_key:
            logger.info(f"✅ OpenAI LLM initialized with {self.model} (backup provider)")
        else:
            logger.warning("⚠️ OpenAI API key not set - backup LLM unavailable")
    
    async def stream_complete(self, messages: List[Dict[str, str]]) -> AsyncGenerator[str, None]:
        """
        Stream completion from OpenAI.
        Compatible with Groq streaming interface.
        """
        if not self.api_key:
            yield "OpenAI API key not configured. Please set OPENAI_API_KEY."
            return
        
        # Ensure system message exists
        if not messages or messages[0].get("role") != "system":
            messages = [
                {
                    "role": "system",
                    "content": "You are a helpful voice assistant. Keep responses concise and natural for voice conversation. Respond in 1-3 sentences unless more detail is requested."
                }
            ] + messages
        
        logger.info(f"🤖 OpenAI streaming with {self.model}")
        
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
            
            try:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload
                ) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        logger.error(f"OpenAI error {response.status_code}: {error_text}")
                        yield f"Error: OpenAI returned {response.status_code}"
                        return
                    
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:]
                            if data == "[DONE]":
                                break
                            
                            try:
                                chunk = json.loads(data)
                                delta = chunk.get("choices", [{}])[0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield content
                            except json.JSONDecodeError:
                                continue
                                
            except Exception as e:
                logger.error(f"OpenAI streaming error: {e}")
                raise
    
    async def complete(self, messages: List[Dict[str, str]]) -> str:
        """Non-streaming completion"""
        full_response = ""
        async for token in self.stream_complete(messages):
            full_response += token
        return full_response
    
    async def health_check(self) -> bool:
        """Check if OpenAI is reachable"""
        if not self.api_key:
            return False
        
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers={"Authorization": f"Bearer {self.api_key}"}
                )
                return response.status_code == 200
        except Exception as e:
            logger.error(f"OpenAI health check failed: {e}")
            return False


class OpenAITTSService:
    """OpenAI TTS Service - Backup provider for Cartesia"""
    
    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY
        self.model = "tts-1"  # Standard quality, faster
        self.voice = "alloy"  # Neutral, good for assistant
        self.base_url = "https://api.openai.com/v1"
        
        if self.api_key:
            logger.info(f"✅ OpenAI TTS initialized with {self.voice} voice (backup provider)")
        else:
            logger.warning("⚠️ OpenAI API key not set - backup TTS unavailable")
    
    async def synthesize(self, text: str) -> bytes:
        """
        Synthesize text to speech using OpenAI.
        Returns MP3 audio data.
        """
        if not self.api_key:
            raise ValueError("OpenAI API key not configured")
        
        if not text or not text.strip():
            return b""
        
        logger.info(f"🔊 OpenAI TTS synthesizing: {text[:50]}...")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "model": self.model,
                "input": text,
                "voice": self.voice,
                "response_format": "mp3"
            }
            
            try:
                response = await client.post(
                    f"{self.base_url}/audio/speech",
                    headers=headers,
                    json=payload
                )
                
                if response.status_code != 200:
                    logger.error(f"OpenAI TTS error {response.status_code}: {response.text}")
                    raise Exception(f"TTS failed: {response.status_code}")
                
                audio_data = response.content
                logger.info(f"✅ OpenAI TTS generated {len(audio_data)} bytes")
                return audio_data
                
            except Exception as e:
                logger.error(f"OpenAI TTS error: {e}")
                raise
    
    async def health_check(self) -> bool:
        """Check if OpenAI TTS is available"""
        # Same check as LLM - uses same API key
        if not self.api_key:
            return False
        
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers={"Authorization": f"Bearer {self.api_key}"}
                )
                return response.status_code == 200
        except Exception as e:
            logger.error(f"OpenAI TTS health check failed: {e}")
            return False


# Singleton instances
openai_llm_service = OpenAILLMService()
openai_tts_service = OpenAITTSService()
