"""
AssemblyAI Speech-to-Text Service (Backup Provider)
Provides STT fallback when Deepgram is unavailable.
"""

import httpx
import logging
import asyncio
from typing import Optional
from app.config import settings

logger = logging.getLogger(__name__)


class AssemblyAISTTService:
    """AssemblyAI STT Service - Backup provider for Deepgram"""
    
    def __init__(self):
        self.api_key = settings.ASSEMBLYAI_API_KEY
        self.base_url = "https://api.assemblyai.com/v2"
        
        if self.api_key:
            logger.info("✅ AssemblyAI STT initialized (backup provider)")
        else:
            logger.warning("⚠️ AssemblyAI API key not set - backup STT unavailable")
    
    async def transcribe(self, audio_data: bytes) -> str:
        """
        Transcribe audio using AssemblyAI.
        
        Note: AssemblyAI uses a 2-step process:
        1. Upload audio file
        2. Create transcription job and poll for result
        
        This is slower than Deepgram streaming but works as a fallback.
        """
        if not self.api_key:
            raise ValueError("AssemblyAI API key not configured")
        
        if len(audio_data) < 1000:
            logger.warning(f"Audio too short for AssemblyAI: {len(audio_data)} bytes")
            return ""
        
        logger.info(f"🎤 AssemblyAI transcribing {len(audio_data)} bytes")
        
        headers = {
            "authorization": self.api_key,
            "content-type": "application/octet-stream"
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Step 1: Upload audio
            upload_response = await client.post(
                f"{self.base_url}/upload",
                headers=headers,
                content=audio_data
            )
            
            if upload_response.status_code != 200:
                logger.error(f"AssemblyAI upload failed: {upload_response.status_code}")
                raise Exception(f"Upload failed: {upload_response.text}")
            
            upload_url = upload_response.json()["upload_url"]
            logger.debug(f"Audio uploaded to AssemblyAI")
            
            # Step 2: Create transcription
            transcript_response = await client.post(
                f"{self.base_url}/transcript",
                headers={"authorization": self.api_key, "content-type": "application/json"},
                json={
                    "audio_url": upload_url,
                    "language_code": "en",
                    "speech_model": "best"  # Use best quality model
                }
            )
            
            if transcript_response.status_code != 200:
                logger.error(f"AssemblyAI transcript creation failed: {transcript_response.status_code}")
                raise Exception(f"Transcript creation failed: {transcript_response.text}")
            
            transcript_id = transcript_response.json()["id"]
            logger.debug(f"Transcription job created: {transcript_id}")
            
            # Step 3: Poll for result
            max_attempts = 30  # 30 seconds max
            for attempt in range(max_attempts):
                poll_response = await client.get(
                    f"{self.base_url}/transcript/{transcript_id}",
                    headers={"authorization": self.api_key}
                )
                
                result = poll_response.json()
                status = result.get("status")
                
                if status == "completed":
                    text = result.get("text", "")
                    logger.info(f"📝 AssemblyAI transcript: {text[:50]}...")
                    return text
                
                elif status == "error":
                    error = result.get("error", "Unknown error")
                    logger.error(f"AssemblyAI transcription error: {error}")
                    raise Exception(f"Transcription failed: {error}")
                
                # Still processing
                await asyncio.sleep(1)
            
            raise TimeoutError("AssemblyAI transcription timed out after 30 seconds")
    
    async def health_check(self) -> bool:
        """Check if AssemblyAI is reachable"""
        if not self.api_key:
            return False
        
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{self.base_url}/transcript",
                    headers={"authorization": self.api_key}
                )
                # Even a 401 means the service is reachable
                return response.status_code in [200, 401, 403]
        except Exception as e:
            logger.error(f"AssemblyAI health check failed: {e}")
            return False


# Singleton instance
assemblyai_stt_service = AssemblyAISTTService()
