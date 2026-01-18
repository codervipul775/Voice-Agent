"""
Noise Suppression Service using noisereduce library
"""

import io
import subprocess
import tempfile
import numpy as np
import soundfile as sf
import noisereduce as nr
from typing import Optional


class NoiseSuppressionService:
    """Service for reducing background noise in audio"""
    
    def __init__(
        self,
        sample_rate: int = 16000,
        stationary: bool = True,
        prop_decrease: float = 0.5
    ):
        """
        Initialize noise suppression service
        
        Args:
            sample_rate: Audio sample rate in Hz (default: 16000 for Deepgram)
            stationary: Whether to use stationary noise reduction (True) or non-stationary (False)
            prop_decrease: Proportion to reduce noise (0-1, higher = more aggressive)
        """
        self.sample_rate = sample_rate
        self.stationary = stationary
        self.prop_decrease = prop_decrease
        self.noise_profile: Optional[np.ndarray] = None
        
    def _webm_to_numpy(self, webm_bytes: bytes) -> tuple[np.ndarray, int]:
        """
        Convert WebM audio to numpy array using ffmpeg
        
        Args:
            webm_bytes: WebM audio bytes
            
        Returns:
            Tuple of (audio_array, sample_rate)
        """
        with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as webm_file:
            webm_file.write(webm_bytes)
            webm_path = webm_file.name
        
        try:
            # Use ffmpeg to convert WebM to PCM
            result = subprocess.run([
                'ffmpeg', '-i', webm_path,
                '-f', 's16le',  # 16-bit PCM
                '-acodec', 'pcm_s16le',
                '-ar', str(self.sample_rate),
                '-ac', '1',  # Mono
                '-'
            ], capture_output=True, check=True)
            
            # Convert PCM bytes to numpy array
            audio_array = np.frombuffer(result.stdout, dtype=np.int16)
            audio_array = audio_array.astype(np.float32) / 32768.0  # Normalize to [-1, 1]
            
            return audio_array, self.sample_rate
            
        finally:
            import os
            os.unlink(webm_path)
    
    def _numpy_to_webm(self, audio_array: np.ndarray, sample_rate: int) -> bytes:
        """
        Convert numpy array back to WebM
        
        Args:
            audio_array: Audio numpy array
            sample_rate: Sample rate
            
        Returns:
            WebM audio bytes
        """
        # Convert to int16 PCM
        audio_int16 = (audio_array * 32768.0).astype(np.int16)
        
        with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as webm_file:
            webm_path = webm_file.name
        
        try:
            # Use ffmpeg to convert PCM to WebM
            process = subprocess.Popen([
                'ffmpeg', '-f', 's16le',
                '-ar', str(sample_rate),
                '-ac', '1',
                '-i', '-',
                '-c:a', 'libopus',
                '-b:a', '24k',
                '-f', 'webm',
                webm_path
            ], stdin=subprocess.PIPE, stderr=subprocess.PIPE)
            
            process.communicate(input=audio_int16.tobytes())
            
            with open(webm_path, 'rb') as f:
                return f.read()
                
        finally:
            import os
            os.unlink(webm_path)
    
    def reduce_noise(self, audio_bytes: bytes) -> bytes:
        """
        Apply noise reduction to audio
        
        Args:
            audio_bytes: Input audio bytes (WebM format)
            
        Returns:
            Cleaned audio bytes (WebM format)
        """
        try:
            # Convert WebM to numpy array
            audio_array, sr = self._webm_to_numpy(audio_bytes)
            
            # Apply noise reduction
            if self.stationary:
                # Stationary noise reduction (good for constant background noise)
                reduced_noise = nr.reduce_noise(
                    y=audio_array,
                    sr=sr,
                    stationary=True,
                    prop_decrease=self.prop_decrease
                )
            else:
                # Non-stationary noise reduction (good for varying noise)
                reduced_noise = nr.reduce_noise(
                    y=audio_array,
                    sr=sr,
                    stationary=False,
                    prop_decrease=self.prop_decrease
                )
            
            # Convert back to WebM format
            return self._numpy_to_webm(reduced_noise, sr)
            
        except Exception as e:
            print(f"⚠️  Error reducing noise: {e}, returning original audio")
            return audio_bytes
    
    def get_noise_level(self, audio_bytes: bytes) -> float:
        """
        Estimate noise level in audio (RMS energy)
        
        Args:
            audio_bytes: Audio bytes
            
        Returns:
            RMS energy value (higher = louder/noisier)
        """
        try:
            audio_array, _ = self._webm_to_numpy(audio_bytes)
            rms = np.sqrt(np.mean(audio_array ** 2))
            return float(rms)
            
        except Exception as e:
            print(f"⚠️  Error calculating noise level: {e}")
            return 0.0
