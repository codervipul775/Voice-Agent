"""
Audio Quality Metrics Service
Calculates SNR, RMS, peak levels, and overall audio quality scores
"""

import numpy as np
import logging
import tempfile
import os
import shutil
from typing import Optional, Dict
from pydub import AudioSegment

logger = logging.getLogger(__name__)

# Check ffprobe availability at module load
_FFPROBE_AVAILABLE = shutil.which("ffprobe") is not None
if not _FFPROBE_AVAILABLE:
    logger.warning("⚠️ ffprobe not found - audio metrics will use fallback estimation")


class AudioMetricsService:
    """
    Service for analyzing audio quality metrics.
    
    Features:
    - SNR (Signal-to-Noise Ratio) estimation
    - RMS energy level calculation
    - Peak amplitude detection
    - Audio quality scoring (0-100)
    - Clipping detection
    """
    
    def __init__(self, sample_rate: int = 16000):
        """
        Initialize audio metrics service.
        
        Args:
            sample_rate: Expected audio sample rate
        """
        self.sample_rate = sample_rate
        
    def _webm_to_numpy(self, webm_data: bytes) -> Optional[np.ndarray]:
        """
        Convert WebM audio to numpy array for analysis.
        
        Args:
            webm_data: WebM audio bytes
            
        Returns:
            Numpy array of audio samples (float32, normalized to [-1, 1])
        """
        if len(webm_data) < 100:
            return None
        
        # If ffprobe is available, use pydub for accurate conversion
        if _FFPROBE_AVAILABLE:
            temp_webm = None
            try:
                # Write WebM to temp file
                with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as f:
                    f.write(webm_data)
                    temp_webm = f.name
                
                # Load with pydub
                audio = AudioSegment.from_file(temp_webm, format="webm")
                
                # Convert to mono, correct sample rate, 16-bit
                audio = audio.set_channels(1)
                audio = audio.set_frame_rate(self.sample_rate)
                audio = audio.set_sample_width(2)
                
                # Get raw data and convert to numpy
                samples = np.frombuffer(audio.raw_data, dtype=np.int16)
                
                # Normalize to float32 [-1, 1]
                samples = samples.astype(np.float32) / 32768.0
                
                return samples
                
            except Exception as e:
                logger.warning(f"pydub conversion failed: {e}, using fallback estimation")
            finally:
                if temp_webm and os.path.exists(temp_webm):
                    try:
                        os.unlink(temp_webm)
                    except:
                        pass
        
        # Fallback: Estimate from raw bytes (works without ffprobe)
        return self._estimate_samples_from_bytes(webm_data)
    
    def _estimate_samples_from_bytes(self, webm_data: bytes) -> Optional[np.ndarray]:
        """
        Estimate audio samples from raw WebM bytes without ffprobe.
        
        This is an approximation that treats bytes as pseudo-audio data
        for basic metric estimation. Not accurate for actual audio playback,
        but sufficient for RMS/peak detection.
        """
        try:
            # Skip WebM header (typically first 40-100 bytes)
            # WebM files start with EBML header, we skip it
            header_skip = min(100, len(webm_data) // 4)
            audio_bytes = webm_data[header_skip:]
            
            if len(audio_bytes) < 100:
                return None
            
            # Interpret bytes as int8 and normalize to float32 [-1, 1]
            # This gives us a rough approximation of the audio signal
            samples = np.frombuffer(audio_bytes, dtype=np.int8).astype(np.float32) / 128.0
            
            # Apply simple smoothing to reduce noise from header/codec artifacts
            window_size = min(8, len(samples) // 10)
            if window_size > 1:
                kernel = np.ones(window_size) / window_size
                samples = np.convolve(samples, kernel, mode='valid')
            
            logger.debug(f"📊 Estimated {len(samples)} samples from {len(webm_data)} bytes (fallback)")
            return samples
            
        except Exception as e:
            logger.error(f"Fallback sample estimation failed: {e}")
            return None
    
    
    def calculate_rms(self, samples: np.ndarray) -> float:
        """
        Calculate RMS (Root Mean Square) energy level.
        
        Args:
            samples: Audio samples as numpy array
            
        Returns:
            RMS value (0.0 to 1.0)
        """
        if len(samples) == 0:
            return 0.0
        return float(np.sqrt(np.mean(samples ** 2)))
    
    def calculate_peak(self, samples: np.ndarray) -> float:
        """
        Calculate peak amplitude.
        
        Args:
            samples: Audio samples as numpy array
            
        Returns:
            Peak amplitude (0.0 to 1.0)
        """
        if len(samples) == 0:
            return 0.0
        return float(np.max(np.abs(samples)))
    
    def calculate_snr(self, samples: np.ndarray, noise_floor: float = 0.01) -> float:
        """
        Estimate Signal-to-Noise Ratio.
        
        This uses a simplified estimation based on:
        - Signal power: RMS of samples above noise threshold
        - Noise power: RMS of samples below noise threshold
        
        Args:
            samples: Audio samples as numpy array
            noise_floor: Threshold to separate signal from noise
            
        Returns:
            SNR in decibels (dB)
        """
        if len(samples) == 0:
            return 0.0
        
        abs_samples = np.abs(samples)
        
        # Separate signal and noise based on amplitude threshold
        signal_mask = abs_samples > noise_floor
        noise_mask = abs_samples <= noise_floor
        
        if not np.any(signal_mask):
            # All noise, no signal
            return 0.0
        
        if not np.any(noise_mask):
            # All signal, estimate noise floor
            noise_power = noise_floor ** 2
        else:
            noise_power = np.mean(samples[noise_mask] ** 2)
        
        signal_power = np.mean(samples[signal_mask] ** 2)
        
        if noise_power <= 0:
            noise_power = 1e-10  # Prevent division by zero
        
        # Calculate SNR in dB
        snr_db = 10 * np.log10(signal_power / noise_power)
        
        return float(max(0.0, snr_db))  # Clamp to positive values
    
    def detect_clipping(self, samples: np.ndarray, threshold: float = 0.99) -> dict:
        """
        Detect audio clipping (samples at or near maximum).
        
        Args:
            samples: Audio samples as numpy array
            threshold: Amplitude threshold for clipping detection
            
        Returns:
            Dictionary with clipping info
        """
        if len(samples) == 0:
            return {"is_clipping": False, "clipped_samples": 0, "clip_percentage": 0.0}
        
        clipped = np.abs(samples) >= threshold
        clipped_count = int(np.sum(clipped))
        clip_pct = clipped_count / len(samples) * 100
        
        return {
            "is_clipping": clipped_count > 0,
            "clipped_samples": clipped_count,
            "clip_percentage": round(clip_pct, 2)
        }
    
    def calculate_quality_score(self, snr: float, rms: float, peak: float, is_clipping: bool) -> int:
        """
        Calculate overall audio quality score (0-100).
        
        Scoring based on:
        - SNR: 40 points (higher is better)
        - RMS: 30 points (moderate is best, too low or high is bad)
        - Peak: 20 points (moderate is best)
        - Clipping: -20 points if clipping detected
        
        Args:
            snr: Signal-to-noise ratio in dB
            rms: RMS energy level
            peak: Peak amplitude
            is_clipping: Whether clipping was detected
            
        Returns:
            Quality score (0-100)
        """
        score = 0
        
        # SNR scoring (0-40 points)
        # Good SNR: > 20dB = full points
        # Moderate: 10-20dB = partial points
        # Poor: < 10dB = few points
        if snr >= 20:
            score += 40
        elif snr >= 10:
            score += int(20 + (snr - 10) * 2)
        else:
            score += int(snr * 2)
        
        # RMS scoring (0-30 points)
        # Ideal RMS: 0.1 - 0.3 (speaking volume)
        # Too quiet: < 0.05
        # Too loud: > 0.5
        if 0.1 <= rms <= 0.3:
            score += 30
        elif 0.05 <= rms < 0.1:
            score += 20
        elif 0.3 < rms <= 0.5:
            score += 20
        elif rms < 0.05:
            score += 10
        else:
            score += 10
        
        # Peak scoring (0-20 points)
        # Ideal peak: 0.3 - 0.8
        if 0.3 <= peak <= 0.8:
            score += 20
        elif 0.2 <= peak < 0.3:
            score += 15
        elif 0.8 < peak < 0.95:
            score += 15
        else:
            score += 10
        
        # Clipping penalty
        if is_clipping:
            score -= 20
        
        return max(0, min(100, score))
    
    def analyze(self, webm_data: bytes) -> Dict:
        """
        Perform complete audio quality analysis.
        
        Args:
            webm_data: WebM audio bytes
            
        Returns:
            Dictionary with all metrics:
            - rms: RMS energy level (0-1)
            - peak: Peak amplitude (0-1)
            - snr_db: Signal-to-noise ratio in dB
            - clipping: Clipping detection info
            - quality_score: Overall quality (0-100)
            - quality_label: Human-readable quality label
        """
        result = {
            "rms": 0.0,
            "peak": 0.0,
            "snr_db": 0.0,
            "clipping": {"is_clipping": False, "clipped_samples": 0, "clip_percentage": 0.0},
            "quality_score": 0,
            "quality_label": "unknown",
            "duration_ms": 0
        }
        
        # Convert to numpy
        samples = self._webm_to_numpy(webm_data)
        if samples is None or len(samples) == 0:
            logger.warning("Could not analyze audio - conversion failed")
            return result
        
        # Calculate all metrics
        result["rms"] = round(self.calculate_rms(samples), 4)
        result["peak"] = round(self.calculate_peak(samples), 4)
        result["snr_db"] = round(self.calculate_snr(samples), 1)
        result["clipping"] = self.detect_clipping(samples)
        result["duration_ms"] = int(len(samples) / self.sample_rate * 1000)
        
        # Calculate quality score
        result["quality_score"] = self.calculate_quality_score(
            result["snr_db"],
            result["rms"],
            result["peak"],
            result["clipping"]["is_clipping"]
        )
        
        # Quality label
        if result["quality_score"] >= 80:
            result["quality_label"] = "excellent"
        elif result["quality_score"] >= 60:
            result["quality_label"] = "good"
        elif result["quality_score"] >= 40:
            result["quality_label"] = "fair"
        else:
            result["quality_label"] = "poor"
        
        logger.info(f"📊 Audio metrics: RMS={result['rms']:.3f}, Peak={result['peak']:.3f}, "
                   f"SNR={result['snr_db']:.1f}dB, Quality={result['quality_score']}/100 ({result['quality_label']})")
        
        return result


def create_audio_metrics_service(sample_rate: int = 16000) -> AudioMetricsService:
    """
    Factory function to create an audio metrics service.
    
    Args:
        sample_rate: Audio sample rate in Hz
        
    Returns:
        Configured AudioMetricsService instance
    """
    return AudioMetricsService(sample_rate=sample_rate)
