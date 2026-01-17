import httpx
import logging
from app.config import settings

logger = logging.getLogger(__name__)

class DeepgramSTTService:
    """Deepgram Speech-to-Text Service"""
    
    def __init__(self):
        self.api_key = settings.DEEPGRAM_API_KEY
        self.base_url = "https://api.deepgram.com/v1"
        
    async def transcribe(self, audio_bytes: bytes) -> str:
        """
        Transcribe audio to text
        
        Args:
            audio_bytes: Raw audio data
            
        Returns:
            Transcribed text
        """
        if not self.api_key:
            logger.warning("Deepgram API key not set, using mock transcription")
            return "This is a mock transcription. Please set DEEPGRAM_API_KEY."
        
        try:
            logger.info(f"Transcribing audio, size: {len(audio_bytes)} bytes")
            # Log first few bytes to check format
            if len(audio_bytes) > 4:
                header = audio_bytes[:4]
                logger.info(f"Audio header: {header.hex()}")
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                headers = {
                    "Authorization": f"Token {self.api_key}",
                    "Content-Type": "audio/webm"
                }
                
                params = {
                    "model": "nova-2",
                    "smart_format": "true"
                }
                
                response = await client.post(
                    f"{self.base_url}/listen",
                    headers=headers,
                    params=params,
                    content=audio_bytes
                )
                
                if response.status_code != 200:
                    logger.error(f"Deepgram error: {response.status_code} - {response.text}")
                
                response.raise_for_status()
                result = response.json()
                
                logger.info(f"Deepgram response: {result}")
                
                # Extract transcript
                transcript = result.get("results", {}).get("channels", [{}])[0]\
                    .get("alternatives", [{}])[0].get("transcript", "")
                
                logger.info(f"Extracted transcript: {transcript}")
                
                return transcript.strip()
                
        except Exception as e:
            logger.error(f"Deepgram STT error: {e}", exc_info=True)
            # Return empty instead of raising to keep session alive
            return ""
