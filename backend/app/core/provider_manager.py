"""
Provider Manager
Orchestrates multiple AI service providers with automatic fallback and health monitoring.
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional, TypeVar, Generic, Callable
from app.core.circuit_breaker import CircuitBreaker, CircuitOpenError, get_circuit

logger = logging.getLogger(__name__)

T = TypeVar('T')  # Generic type for provider results


class ProviderType(Enum):
    """Types of AI service providers"""
    STT = "stt"      # Speech-to-Text
    LLM = "llm"      # Large Language Model
    TTS = "tts"      # Text-to-Speech
    SEARCH = "search"  # Web Search


@dataclass
class ProviderConfig:
    """Configuration for a provider"""
    name: str
    provider_type: ProviderType
    priority: int = 0  # Lower = higher priority (0 = primary)
    enabled: bool = True
    failure_threshold: int = 3
    recovery_timeout: float = 30.0


class BaseProvider(ABC):
    """Base class for all AI providers"""
    
    def __init__(self, config: ProviderConfig):
        self.config = config
        self.circuit = get_circuit(
            f"{config.provider_type.value}_{config.name}",
            failure_threshold=config.failure_threshold,
            recovery_timeout=config.recovery_timeout
        )
    
    @property
    def name(self) -> str:
        return self.config.name
    
    @property
    def is_available(self) -> bool:
        return self.config.enabled and self.circuit.is_available
    
    @abstractmethod
    async def execute(self, *args, **kwargs) -> Any:
        """Execute the provider's main function"""
        pass
    
    @abstractmethod
    async def health_check(self) -> bool:
        """Check if provider is healthy"""
        pass


class ProviderManager(Generic[T]):
    """
    Manages multiple providers with automatic fallback.
    
    Features:
    - Priority-based provider selection
    - Automatic fallback on failure
    - Circuit breaker integration
    - Health monitoring
    - Metrics tracking
    """
    
    def __init__(self, provider_type: ProviderType):
        self.provider_type = provider_type
        self._providers: List[BaseProvider] = []
        self._current_provider: Optional[BaseProvider] = None
        self._fallback_count = 0
        self._lock = asyncio.Lock()
        
        logger.info(f"🎛️ ProviderManager initialized for {provider_type.value}")
    
    def register(self, provider: BaseProvider):
        """Register a provider"""
        self._providers.append(provider)
        # Sort by priority (lower = higher priority)
        self._providers.sort(key=lambda p: p.config.priority)
        
        logger.info(f"📌 Registered {provider.name} for {self.provider_type.value} "
                   f"(priority={provider.config.priority})")
        
        # Set initial provider
        if self._current_provider is None:
            self._current_provider = provider
    
    @property
    def providers(self) -> List[BaseProvider]:
        """Get all registered providers"""
        return self._providers.copy()
    
    @property
    def available_providers(self) -> List[BaseProvider]:
        """Get providers that are currently available"""
        return [p for p in self._providers if p.is_available]
    
    @property
    def current_provider(self) -> Optional[BaseProvider]:
        """Get the currently active provider"""
        return self._current_provider
    
    def _get_next_available(self, exclude: Optional[BaseProvider] = None) -> Optional[BaseProvider]:
        """Get the next available provider, optionally excluding one"""
        for provider in self._providers:
            if provider.is_available and provider != exclude:
                return provider
        return None
    
    async def execute(self, *args, **kwargs) -> T:
        """
        Execute request using available providers with automatic fallback.
        
        Tries providers in priority order until one succeeds or all fail.
        """
        errors = []
        tried_providers = set()
        
        async with self._lock:
            # Start with current provider if available
            provider = self._current_provider if self._current_provider and self._current_provider.is_available else None
            
            # If current not available, get next
            if provider is None:
                provider = self._get_next_available()
            
            while provider is not None:
                if provider.name in tried_providers:
                    # Already tried this one
                    provider = self._get_next_available(exclude=provider)
                    continue
                
                tried_providers.add(provider.name)
                
                try:
                    logger.debug(f"🔄 Trying {self.provider_type.value} provider: {provider.name}")
                    result = await provider.execute(*args, **kwargs)
                    
                    # Success - record and potentially update current
                    await provider.circuit.record_success()
                    
                    if provider != self._current_provider:
                        old_name = self._current_provider.name if self._current_provider else "none"
                        logger.info(f"🔀 {self.provider_type.value} switched: {old_name} → {provider.name}")
                        self._current_provider = provider
                        self._fallback_count += 1
                    
                    return result
                    
                except CircuitOpenError:
                    logger.warning(f"⚡ Circuit open for {provider.name}, skipping")
                    provider = self._get_next_available(exclude=provider)
                    
                except Exception as e:
                    logger.error(f"❌ {provider.name} failed: {str(e)[:100]}")
                    await provider.circuit.record_failure(e)
                    errors.append((provider.name, e))
                    
                    # Try next provider
                    provider = self._get_next_available(exclude=provider)
            
            # All providers failed
            error_summary = "; ".join([f"{name}: {str(e)[:50]}" for name, e in errors])
            raise AllProvidersFailedError(
                f"All {self.provider_type.value} providers failed: {error_summary}"
            )
    
    async def execute_with_provider(self, provider_name: str, *args, **kwargs) -> T:
        """Execute using a specific provider (no fallback)"""
        provider = next((p for p in self._providers if p.name == provider_name), None)
        
        if provider is None:
            raise ValueError(f"Provider '{provider_name}' not found")
        
        if not provider.is_available:
            raise ProviderUnavailableError(f"Provider '{provider_name}' is not available")
        
        return await provider.execute(*args, **kwargs)
    
    async def health_check_all(self) -> Dict[str, bool]:
        """Run health check on all providers"""
        results = {}
        for provider in self._providers:
            try:
                results[provider.name] = await provider.health_check()
            except Exception as e:
                logger.error(f"Health check failed for {provider.name}: {e}")
                results[provider.name] = False
        return results
    
    def get_status(self) -> Dict[str, Any]:
        """Get detailed status of all providers"""
        return {
            "provider_type": self.provider_type.value,
            "current_provider": self._current_provider.name if self._current_provider else None,
            "fallback_count": self._fallback_count,
            "providers": [
                {
                    "name": p.name,
                    "priority": p.config.priority,
                    "enabled": p.config.enabled,
                    "available": p.is_available,
                    "circuit": p.circuit.to_dict()
                }
                for p in self._providers
            ]
        }
    
    def reset_all_circuits(self):
        """Reset all circuit breakers"""
        for provider in self._providers:
            provider.circuit.reset()
        logger.info(f"🔄 Reset all circuits for {self.provider_type.value}")


class AllProvidersFailedError(Exception):
    """Raised when all providers fail"""
    pass


class ProviderUnavailableError(Exception):
    """Raised when a specific provider is unavailable"""
    pass


# ============================================================================
# STT Provider Implementations
# ============================================================================

class STTProvider(BaseProvider):
    """Base class for Speech-to-Text providers"""
    
    @abstractmethod
    async def transcribe(self, audio_data: bytes) -> str:
        """Transcribe audio to text"""
        pass
    
    async def execute(self, audio_data: bytes) -> str:
        return await self.transcribe(audio_data)


class DeepgramSTTProvider(STTProvider):
    """Deepgram STT Provider (Primary)"""
    
    def __init__(self, service):
        super().__init__(ProviderConfig(
            name="deepgram",
            provider_type=ProviderType.STT,
            priority=0,  # Primary
            failure_threshold=3,
            recovery_timeout=30.0
        ))
        self.service = service
    
    async def transcribe(self, audio_data: bytes) -> str:
        return await self.service.transcribe(audio_data)
    
    async def health_check(self) -> bool:
        # Simple health check - verify API key exists
        return bool(self.service.api_key)


class AssemblyAISTTProvider(STTProvider):
    """AssemblyAI STT Provider (Backup)"""
    
    def __init__(self, service):
        super().__init__(ProviderConfig(
            name="assemblyai",
            provider_type=ProviderType.STT,
            priority=1,  # Backup
            failure_threshold=3,
            recovery_timeout=30.0
        ))
        self.service = service
    
    async def transcribe(self, audio_data: bytes) -> str:
        return await self.service.transcribe(audio_data)
    
    async def health_check(self) -> bool:
        return bool(self.service.api_key)


# ============================================================================
# LLM Provider Implementations  
# ============================================================================

class LLMProvider(BaseProvider):
    """Base class for LLM providers"""
    
    @abstractmethod
    async def complete(self, messages: list) -> str:
        """Generate completion"""
        pass
    
    @abstractmethod
    def stream_complete(self, messages: list):
        """Stream completion (async generator)"""
        pass
    
    async def execute(self, messages: list, stream: bool = True):
        if stream:
            return self.stream_complete(messages)
        return await self.complete(messages)


class GroqLLMProvider(LLMProvider):
    """Groq LLM Provider (Primary)"""
    
    def __init__(self, service):
        super().__init__(ProviderConfig(
            name="groq",
            provider_type=ProviderType.LLM,
            priority=0,  # Primary
            failure_threshold=3,
            recovery_timeout=30.0
        ))
        self.service = service
    
    async def complete(self, messages: list) -> str:
        full_response = ""
        async for token in self.service.stream_complete(messages):
            full_response += token
        return full_response
    
    def stream_complete(self, messages: list):
        return self.service.stream_complete(messages)
    
    async def health_check(self) -> bool:
        return bool(self.service.api_key)


class OpenAILLMProvider(LLMProvider):
    """OpenAI LLM Provider (Backup)"""
    
    def __init__(self, service):
        super().__init__(ProviderConfig(
            name="openai",
            provider_type=ProviderType.LLM,
            priority=1,  # Backup
            failure_threshold=3,
            recovery_timeout=30.0
        ))
        self.service = service
    
    async def complete(self, messages: list) -> str:
        full_response = ""
        async for token in self.service.stream_complete(messages):
            full_response += token
        return full_response
    
    def stream_complete(self, messages: list):
        return self.service.stream_complete(messages)
    
    async def health_check(self) -> bool:
        return bool(self.service.api_key)


# ============================================================================
# TTS Provider Implementations
# ============================================================================

class TTSProvider(BaseProvider):
    """Base class for TTS providers"""
    
    @abstractmethod
    async def synthesize(self, text: str) -> bytes:
        """Synthesize text to audio"""
        pass
    
    async def execute(self, text: str) -> bytes:
        return await self.synthesize(text)


class CartesiaTTSProvider(TTSProvider):
    """Cartesia TTS Provider (Primary)"""
    
    def __init__(self, service):
        super().__init__(ProviderConfig(
            name="cartesia",
            provider_type=ProviderType.TTS,
            priority=0,  # Primary
            failure_threshold=3,
            recovery_timeout=30.0
        ))
        self.service = service
    
    async def synthesize(self, text: str) -> bytes:
        return await self.service.synthesize(text)
    
    async def health_check(self) -> bool:
        return bool(self.service.api_key)


class OpenAITTSProvider(TTSProvider):
    """OpenAI TTS Provider (Backup)"""
    
    def __init__(self, service):
        super().__init__(ProviderConfig(
            name="openai_tts",
            provider_type=ProviderType.TTS,
            priority=1,  # Backup
            failure_threshold=3,
            recovery_timeout=30.0
        ))
        self.service = service
    
    async def synthesize(self, text: str) -> bytes:
        return await self.service.synthesize(text)
    
    async def health_check(self) -> bool:
        return bool(self.service.api_key)


# ============================================================================
# Global Provider Managers (Singletons)
# ============================================================================

_stt_manager: Optional[ProviderManager] = None
_llm_manager: Optional[ProviderManager] = None
_tts_manager: Optional[ProviderManager] = None


def get_stt_manager() -> ProviderManager:
    """Get the global STT provider manager"""
    global _stt_manager
    if _stt_manager is None:
        _stt_manager = ProviderManager(ProviderType.STT)
    return _stt_manager


def get_llm_manager() -> ProviderManager:
    """Get the global LLM provider manager"""
    global _llm_manager
    if _llm_manager is None:
        _llm_manager = ProviderManager(ProviderType.LLM)
    return _llm_manager


def get_tts_manager() -> ProviderManager:
    """Get the global TTS provider manager"""
    global _tts_manager
    if _tts_manager is None:
        _tts_manager = ProviderManager(ProviderType.TTS)
    return _tts_manager


def get_all_provider_status() -> Dict[str, Any]:
    """Get status of all provider managers"""
    return {
        "stt": get_stt_manager().get_status() if _stt_manager else None,
        "llm": get_llm_manager().get_status() if _llm_manager else None,
        "tts": get_tts_manager().get_status() if _tts_manager else None
    }
