"""
Deepgram Streaming STT Service
Real-time speech-to-text using WebSocket for word-by-word transcription
"""
import asyncio
import logging
import json
from typing import Optional, Callable, Awaitable
from app.config import settings
import websockets

logger = logging.getLogger(__name__)


class DeepgramStreamingSTT:
    """
    Real-time streaming STT using Deepgram WebSocket API.
    
    Provides word-by-word transcription as the user speaks,
    with interim (partial) and final results.
    """
    
    DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen"
    
    def __init__(
        self,
        on_interim_transcript: Optional[Callable[[str], Awaitable[None]]] = None,
        on_final_transcript: Optional[Callable[[str], Awaitable[None]]] = None,
        on_speech_started: Optional[Callable[[], Awaitable[None]]] = None,
        on_utterance_end: Optional[Callable[[], Awaitable[None]]] = None,
    ):
        """
        Initialize streaming STT.
        
        Args:
            on_interim_transcript: Callback for partial transcripts (word-by-word updates)
            on_final_transcript: Callback for finalized transcript segments
            on_speech_started: Callback when speech is detected
            on_utterance_end: Callback when an utterance ends (silence detected)
        """
        self.api_key = settings.DEEPGRAM_API_KEY
        self.on_interim_transcript = on_interim_transcript
        self.on_final_transcript = on_final_transcript
        self.on_speech_started = on_speech_started
        self.on_utterance_end = on_utterance_end
        
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._listen_task: Optional[asyncio.Task] = None
        self._connected = False
        self._current_transcript = ""
        self._speech_detected = False
        
    def _build_ws_url(self) -> str:
        """Build WebSocket URL with query parameters."""
        params = [
            "model=nova-2",
            "language=en",
            "smart_format=true",
            "interim_results=true",      # Enable word-by-word updates
            "utterance_end_ms=1000",     # Detect end of utterance after 1s silence
            "vad_events=true",           # Get voice activity events
            "endpointing=300",           # Faster endpointing (300ms)
            # Automatic format detection for WebM/Opus
            "no_delay=true"
        ]
        return f"{self.DEEPGRAM_WS_URL}?{'&'.join(params)}"
    
    async def connect(self) -> bool:
        """Establish WebSocket connection to Deepgram."""
        if not self.api_key:
            logger.error("Deepgram API key not set")
            return False
            
        try:
            url = self._build_ws_url()
            headers = {"Authorization": f"Token {self.api_key}"}
            
            self._ws = await websockets.connect(
                url,
                extra_headers=headers,
                ping_interval=20,
                ping_timeout=10,
            )
            self._connected = True
            
            # Start listening for responses
            self._listen_task = asyncio.create_task(self._listen_loop())
            
            logger.info("✅ Deepgram streaming STT connected")
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to Deepgram: {e}")
            self._connected = False
            return False
    
    async def _listen_loop(self):
        """Listen for transcription results from Deepgram."""
        try:
            async for message in self._ws:
                try:
                    data = json.loads(message)
                    await self._handle_message(data)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON from Deepgram: {message[:100]}")
                except Exception as e:
                    logger.error(f"Error handling Deepgram message: {e}")
                    
        except websockets.exceptions.ConnectionClosed as e:
            logger.info(f"Deepgram connection closed: {e}")
        except Exception as e:
            logger.error(f"Deepgram listen loop error: {e}")
        finally:
            self._connected = False
    
    async def _handle_message(self, data: dict):
        """Process messages from Deepgram."""
        msg_type = data.get("type", "")
        
        # Voice Activity Detection events
        if msg_type == "SpeechStarted":
            logger.debug("🎤 Speech started")
            self._speech_detected = True
            if self.on_speech_started:
                await self.on_speech_started()
            return
        
        # Utterance end (silence detected after speech)
        if msg_type == "UtteranceEnd":
            logger.debug("🔇 Utterance ended")
            if self.on_utterance_end:
                await self.on_utterance_end()
            return
        
        # Transcription results
        if msg_type == "Results":
            channel = data.get("channel", {})
            alternatives = channel.get("alternatives", [])
            
            if not alternatives:
                return
            
            transcript = alternatives[0].get("transcript", "").strip()
            is_final = data.get("is_final", False)
            speech_final = data.get("speech_final", False)
            
            if not transcript:
                return
            
            if is_final:
                # Final transcript for this segment
                logger.info(f"📝 Final: '{transcript}'")
                self._current_transcript = transcript
                
                if self.on_final_transcript:
                    await self.on_final_transcript(transcript)
                    
                # If speech_final, the complete utterance is done
                if speech_final:
                    logger.info(f"✅ Utterance complete: '{transcript}'")
                    self._speech_detected = False
            else:
                # Interim (partial) transcript - word-by-word updates
                logger.debug(f"💬 Interim: '{transcript}'")
                self._current_transcript = transcript
                
                if self.on_interim_transcript:
                    await self.on_interim_transcript(transcript)
    
    async def send_audio(self, audio_data: bytes):
        """
        Send audio data to Deepgram for transcription.
        
        Args:
            audio_data: Raw PCM audio (16-bit, 16kHz, mono)
        """
        if not self._connected or not self._ws:
            logger.warning("Cannot send audio - not connected")
            return
            
        try:
            await self._ws.send(audio_data)
        except Exception as e:
            logger.error(f"Error sending audio to Deepgram: {e}")
    
    async def finalize(self):
        """Signal end of audio stream (optional, for clean close)."""
        if self._ws and self._connected:
            try:
                # Send close stream message
                await self._ws.send(json.dumps({"type": "CloseStream"}))
            except Exception as e:
                logger.warning(f"Error sending close stream: {e}")
    
    async def disconnect(self):
        """Close the WebSocket connection."""
        self._connected = False
        
        if self._listen_task:
            self._listen_task.cancel()
            try:
                await self._listen_task
            except asyncio.CancelledError:
                pass
            self._listen_task = None
        
        if self._ws:
            try:
                await self._ws.close()
            except Exception as e:
                logger.warning(f"Error closing Deepgram connection: {e}")
            self._ws = None
        
        logger.info("🔌 Deepgram streaming STT disconnected")
    
    @property
    def is_connected(self) -> bool:
        """Check if WebSocket is connected."""
        return self._connected
    
    @property
    def current_transcript(self) -> str:
        """Get the current transcript (interim or final)."""
        return self._current_transcript


def create_streaming_stt(
    on_interim: Callable[[str], Awaitable[None]] = None,
    on_final: Callable[[str], Awaitable[None]] = None,
    on_speech_start: Callable[[], Awaitable[None]] = None,
    on_utterance_end: Callable[[], Awaitable[None]] = None,
) -> DeepgramStreamingSTT:
    """
    Factory function to create a streaming STT service.
    
    Args:
        on_interim: Callback for interim transcripts (word-by-word)
        on_final: Callback for final transcripts
        on_speech_start: Callback when speech is detected
        on_utterance_end: Callback when utterance ends
        
    Returns:
        Configured DeepgramStreamingSTT instance
    """
    return DeepgramStreamingSTT(
        on_interim_transcript=on_interim,
        on_final_transcript=on_final,
        on_speech_started=on_speech_start,
        on_utterance_end=on_utterance_end,
    )
