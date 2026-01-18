"""
Voice Activity Detection (VAD) Service
Uses WebRTC VAD for robust speech detection with proper audio conversion
"""

import webrtcvad
import logging
import tempfile
import os
import io
from typing import Optional, Tuple
from pydub import AudioSegment

logger = logging.getLogger(__name__)


class VoiceActivityDetector:
    """
    Detects speech in audio streams using WebRTC VAD algorithm.
    
    Features:
    - Real-time speech detection
    - Configurable aggressiveness (0-3)
    - Buffer-based smoothing to reduce false positives
    - Automatic WebM to PCM conversion
    - Proper silence duration detection
    """
    
    def __init__(
        self,
        sample_rate: int = 16000,
        aggressiveness: int = 2,
        frame_duration_ms: int = 30,
        speech_frames_threshold: int = 3,
        silence_frames_threshold: int = 15,
        silence_timeout_ms: int = 800
    ):
        """
        Initialize VAD detector.
        
        Args:
            sample_rate: Audio sample rate (8000, 16000, 32000, or 48000 Hz)
            aggressiveness: VAD aggressiveness (0=least aggressive, 3=most aggressive)
            frame_duration_ms: Frame duration in milliseconds (10, 20, or 30)
            speech_frames_threshold: Number of consecutive speech frames to trigger speech start
            silence_frames_threshold: Number of consecutive silence frames to trigger speech end
            silence_timeout_ms: Milliseconds of silence before considering speech ended
        """
        # Validate sample rate
        if sample_rate not in [8000, 16000, 32000, 48000]:
            raise ValueError(f"Sample rate must be 8000, 16000, 32000, or 48000. Got {sample_rate}")
        
        # Validate frame duration
        if frame_duration_ms not in [10, 20, 30]:
            raise ValueError(f"Frame duration must be 10, 20, or 30 ms. Got {frame_duration_ms}")
        
        # Validate aggressiveness
        if aggressiveness not in [0, 1, 2, 3]:
            raise ValueError(f"Aggressiveness must be 0-3. Got {aggressiveness}")
        
        self.sample_rate = sample_rate
        self.aggressiveness = aggressiveness
        self.frame_duration_ms = frame_duration_ms
        self.speech_frames_threshold = speech_frames_threshold
        self.silence_frames_threshold = silence_frames_threshold
        self.silence_timeout_ms = silence_timeout_ms
        
        # Calculate frame size in bytes (16-bit PCM = 2 bytes per sample)
        self.samples_per_frame = int(sample_rate * frame_duration_ms / 1000)
        self.frame_size = self.samples_per_frame * 2  # 2 bytes per sample (16-bit)
        
        # Initialize WebRTC VAD
        self.vad = webrtcvad.Vad(aggressiveness)
        
        # State tracking
        self.is_speaking = False
        self.speech_frame_count = 0
        self.silence_frame_count = 0
        self.total_speech_frames = 0
        
        logger.info(f"🎙️ VAD initialized: {sample_rate}Hz, aggressiveness={aggressiveness}, "
                   f"frame={frame_duration_ms}ms, samples_per_frame={self.samples_per_frame}, "
                   f"frame_size={self.frame_size} bytes")
    
    def convert_webm_to_pcm(self, webm_data: bytes) -> Optional[bytes]:
        """
        Convert WebM audio to PCM format suitable for VAD.
        Uses pydub for reliable conversion.
        
        Args:
            webm_data: WebM audio bytes
            
        Returns:
            PCM audio bytes (16-bit, mono, at sample_rate) or None if conversion fails
        """
        if len(webm_data) < 100:
            logger.warning(f"WebM data too short: {len(webm_data)} bytes")
            return None
            
        temp_webm = None
        try:
            # Write WebM to temp file (pydub needs file for WebM)
            with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as f:
                f.write(webm_data)
                temp_webm = f.name
            
            # Load with pydub
            audio = AudioSegment.from_file(temp_webm, format="webm")
            
            # Convert to mono, correct sample rate, 16-bit
            audio = audio.set_channels(1)
            audio = audio.set_frame_rate(self.sample_rate)
            audio = audio.set_sample_width(2)  # 16-bit = 2 bytes
            
            # Get raw PCM data
            pcm_data = audio.raw_data
            
            logger.info(f"✅ Converted WebM ({len(webm_data)} bytes) → PCM ({len(pcm_data)} bytes), "
                       f"duration: {len(audio)}ms")
            
            return pcm_data
            
        except Exception as e:
            logger.error(f"❌ WebM to PCM conversion failed: {e}")
            return None
        finally:
            if temp_webm and os.path.exists(temp_webm):
                try:
                    os.unlink(temp_webm)
                except:
                    pass
    
    def analyze_audio(self, webm_data: bytes) -> dict:
        """
        Analyze audio for speech activity.
        
        Args:
            webm_data: WebM audio bytes
            
        Returns:
            Dictionary with analysis results:
            - has_speech: bool - whether speech was detected
            - speech_ratio: float - ratio of speech frames (0.0-1.0)
            - speech_ended: bool - whether speech just ended (silence detected)
            - duration_ms: int - duration of audio analyzed
        """
        result = {
            "has_speech": False,
            "speech_ratio": 0.0,
            "speech_ended": False,
            "duration_ms": 0,
            "frames_analyzed": 0
        }
        
        # Convert WebM to PCM
        pcm_data = self.convert_webm_to_pcm(webm_data)
        if not pcm_data:
            logger.warning("Could not convert audio for VAD analysis")
            return result
        
        # Process frames
        total_frames = 0
        speech_frames = 0
        
        for i in range(0, len(pcm_data) - self.frame_size, self.frame_size):
            frame = pcm_data[i:i + self.frame_size]
            
            if len(frame) != self.frame_size:
                continue
                
            total_frames += 1
            
            try:
                is_speech = self.vad.is_speech(frame, self.sample_rate)
                if is_speech:
                    speech_frames += 1
                    self.speech_frame_count += 1
                    self.silence_frame_count = 0
                else:
                    self.silence_frame_count += 1
                    self.speech_frame_count = 0
            except Exception as e:
                logger.debug(f"VAD frame error: {e}")
                continue
        
        if total_frames > 0:
            result["speech_ratio"] = speech_frames / total_frames
            result["has_speech"] = result["speech_ratio"] > 0.3  # 30% speech threshold
            result["duration_ms"] = total_frames * self.frame_duration_ms
            result["frames_analyzed"] = total_frames
        
        # Detect speech state changes
        previous_speaking = self.is_speaking
        
        # Start speaking: enough consecutive speech frames
        if not self.is_speaking and self.speech_frame_count >= self.speech_frames_threshold:
            self.is_speaking = True
            self.total_speech_frames = 0
            logger.info("🗣️ Speech STARTED")
        
        # Count total speech frames while speaking
        if self.is_speaking:
            self.total_speech_frames += speech_frames
        
        # Stop speaking: enough consecutive silence frames
        if self.is_speaking and self.silence_frame_count >= self.silence_frames_threshold:
            self.is_speaking = False
            result["speech_ended"] = True
            logger.info(f"🤫 Speech ENDED (total speech frames: {self.total_speech_frames})")
        
        logger.info(f"📊 VAD: {speech_frames}/{total_frames} frames = {result['speech_ratio']:.1%} speech, "
                   f"speaking={self.is_speaking}, speech_ended={result['speech_ended']}")
        
        return result
    
    def process_frame(self, audio_frame: bytes) -> Tuple[bool, bool]:
        """
        Process a single audio frame and detect speech.
        
        Args:
            audio_frame: Raw PCM audio data (16-bit, mono)
            
        Returns:
            Tuple of (is_speech_detected, speech_state_changed)
            - is_speech_detected: True if currently speaking
            - speech_state_changed: True if speech state just changed
        """
        # Ensure frame is correct size
        if len(audio_frame) != self.frame_size:
            logger.warning(f"Frame size mismatch: expected {self.frame_size}, got {len(audio_frame)}")
            return self.is_speaking, False
        
        # Run VAD on this frame
        try:
            frame_is_speech = self.vad.is_speech(audio_frame, self.sample_rate)
        except Exception as e:
            logger.error(f"VAD error: {e}")
            return self.is_speaking, False
        
        # Update counters
        if frame_is_speech:
            self.speech_frame_count += 1
            self.silence_frame_count = 0
        else:
            self.silence_frame_count += 1
            self.speech_frame_count = 0
        
        # Detect state changes
        state_changed = False
        
        # Start speaking: enough consecutive speech frames
        if not self.is_speaking and self.speech_frame_count >= self.speech_frames_threshold:
            self.is_speaking = True
            state_changed = True
            logger.info("🗣️ Speech started")
        
        # Stop speaking: enough consecutive silence frames
        elif self.is_speaking and self.silence_frame_count >= self.silence_frames_threshold:
            self.is_speaking = False
            state_changed = True
            logger.info("🤫 Speech ended")
        
        return self.is_speaking, state_changed
    
    def reset(self):
        """Reset VAD state (useful between conversations)."""
        self.is_speaking = False
        self.speech_frame_count = 0
        self.silence_frame_count = 0
        self.total_speech_frames = 0
        logger.info("🔄 VAD state reset")
    
    def get_state(self) -> dict:
        """Get current VAD state for debugging."""
        return {
            "is_speaking": self.is_speaking,
            "speech_frame_count": self.speech_frame_count,
            "silence_frame_count": self.silence_frame_count,
            "total_speech_frames": self.total_speech_frames
        }


def create_vad_service(
    aggressiveness: int = 2,
    sample_rate: int = 16000,
    silence_frames: int = 15
) -> VoiceActivityDetector:
    """
    Factory function to create a VAD service with sensible defaults.
    
    Aggressiveness levels:
    - 0: Least aggressive (more speech detected, fewer false negatives)
    - 1: Quality mode
    - 2: Low bitrate mode (balanced, recommended)
    - 3: Very aggressive (less speech detected, fewer false positives)
    
    Args:
        aggressiveness: VAD aggressiveness level (0-3)
        sample_rate: Audio sample rate in Hz
        silence_frames: Number of silence frames before speech end detection
        
    Returns:
        Configured VoiceActivityDetector instance
    """
    return VoiceActivityDetector(
        sample_rate=sample_rate,
        aggressiveness=aggressiveness,
        frame_duration_ms=30,  # 30ms frames for smooth detection
        speech_frames_threshold=3,  # 90ms of speech to start
        silence_frames_threshold=silence_frames,  # Configurable silence detection
        silence_timeout_ms=800  # 800ms silence timeout
    )
