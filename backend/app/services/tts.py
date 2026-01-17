import httpx
import logging
import struct
from app.config import settings

logger = logging.getLogger(__name__)

class CartesiaTTSService:
    """Cartesia Text-to-Speech Service"""
    
    def __init__(self):
        self.api_key = settings.CARTESIA_API_KEY
        self.base_url = "https://api.cartesia.ai"
        
    async def synthesize(self, text: str) -> bytes:
        """
        Convert text to speech
        
        Args:
            text: Text to convert
            
        Returns:
            Audio data as bytes (WAV format)
        """
        if not self.api_key:
            logger.warning("Cartesia API key not set, returning empty audio")
            return self._generate_silence()
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                headers = {
                    "X-API-Key": self.api_key,
                    "Cartesia-Version": "2024-06-10",
                    "Content-Type": "application/json"
                }
                
                payload = {
                    "model_id": "sonic-english",
                    "transcript": text,
                    "voice": {
                        "mode": "id",
                        "id": "a0e99841-438c-4a64-b679-ae501e7d6091"
                    },
                    "output_format": {
                        "container": "raw",
                        "encoding": "pcm_s16le",
                        "sample_rate": 24000
                    }
                }
                
                response = await client.post(
                    f"{self.base_url}/tts/bytes",
                    headers=headers,
                    json=payload
                )
                
                response.raise_for_status()
                pcm_data = response.content
                
                # Convert PCM to WAV
                return self._pcm_to_wav(pcm_data, sample_rate=24000, channels=1, sample_width=2)
                
        except Exception as e:
            logger.error(f"Cartesia TTS error: {e}", exc_info=True)
            return self._generate_silence()
    
    def _pcm_to_wav(self, pcm_data: bytes, sample_rate: int, channels: int, sample_width: int) -> bytes:
        """Convert raw PCM data to WAV format"""
        # WAV header
        datasize = len(pcm_data)
        header = struct.pack(
            '<4sI4s4sIHHIIHH4sI',
            b'RIFF',
            datasize + 36,  # File size - 8
            b'WAVE',
            b'fmt ',
            16,  # fmt chunk size
            1,   # PCM format
            channels,
            sample_rate,
            sample_rate * channels * sample_width,  # byte rate
            channels * sample_width,  # block align
            sample_width * 8,  # bits per sample
            b'data',
            datasize
        )
        return header + pcm_data
    
    def _generate_silence(self, duration_ms: int = 100) -> bytes:
        """Generate silent audio in WAV format"""
        sample_rate = 24000
        channels = 1
        sample_width = 2
        num_samples = int(sample_rate * duration_ms / 1000)
        pcm_data = b'\x00' * (num_samples * channels * sample_width)
        return self._pcm_to_wav(pcm_data, sample_rate, channels, sample_width)
