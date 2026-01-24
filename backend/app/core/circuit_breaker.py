"""
Circuit Breaker Pattern Implementation
Prevents cascading failures by tracking provider health and temporarily disabling failing providers.
"""

import asyncio
import logging
import time
from dataclasses import dataclass
from enum import Enum
from typing import Callable, Any, Optional
from functools import wraps

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"      # Normal operation - requests flow through
    OPEN = "open"          # Failing - requests blocked, fail fast
    HALF_OPEN = "half_open"  # Testing - allow one request to test recovery


@dataclass
class CircuitStats:
    """Statistics for a circuit breaker"""
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    consecutive_failures: int = 0
    last_failure_time: Optional[float] = None
    last_success_time: Optional[float] = None
    state_changed_at: float = 0


class CircuitBreaker:
    """
    Circuit Breaker for provider resilience.
    
    States:
    - CLOSED: Normal operation, requests pass through
    - OPEN: Provider failing, requests blocked (fail fast)
    - HALF_OPEN: Recovery testing, allow one request through
    
    Transitions:
    - CLOSED → OPEN: After `failure_threshold` consecutive failures
    - OPEN → HALF_OPEN: After `recovery_timeout` seconds
    - HALF_OPEN → CLOSED: On success
    - HALF_OPEN → OPEN: On failure
    """
    
    def __init__(
        self,
        name: str,
        failure_threshold: int = 3,
        recovery_timeout: float = 30.0,
        success_threshold: int = 1
    ):
        """
        Initialize circuit breaker.
        
        Args:
            name: Identifier for this circuit (e.g., "deepgram_stt")
            failure_threshold: Consecutive failures before opening circuit
            recovery_timeout: Seconds to wait before testing recovery
            success_threshold: Successes needed in half-open to close circuit
        """
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.success_threshold = success_threshold
        
        self._state = CircuitState.CLOSED
        self._stats = CircuitStats(state_changed_at=time.time())
        self._lock = asyncio.Lock()
        self._half_open_successes = 0
        
        logger.info(f"🔌 Circuit breaker '{name}' initialized: "
                   f"threshold={failure_threshold}, timeout={recovery_timeout}s")
    
    @property
    def state(self) -> CircuitState:
        """Current circuit state"""
        return self._state
    
    @property
    def stats(self) -> CircuitStats:
        """Circuit statistics"""
        return self._stats
    
    @property
    def is_available(self) -> bool:
        """Check if circuit allows requests"""
        if self._state == CircuitState.CLOSED:
            return True
        
        if self._state == CircuitState.OPEN:
            # Check if recovery timeout has passed
            time_since_open = time.time() - self._stats.state_changed_at
            if time_since_open >= self.recovery_timeout:
                # Transition to half-open
                self._transition_to(CircuitState.HALF_OPEN)
                return True
            return False
        
        # HALF_OPEN - allow request for testing
        return True
    
    def _transition_to(self, new_state: CircuitState):
        """Transition to a new state"""
        old_state = self._state
        self._state = new_state
        self._stats.state_changed_at = time.time()
        self._half_open_successes = 0
        
        emoji = {"closed": "✅", "open": "🔴", "half_open": "🟡"}
        logger.info(f"🔌 Circuit '{self.name}': {old_state.value} → {new_state.value} "
                   f"{emoji.get(new_state.value, '')}")
    
    async def record_success(self):
        """Record a successful request"""
        async with self._lock:
            self._stats.total_requests += 1
            self._stats.successful_requests += 1
            self._stats.consecutive_failures = 0
            self._stats.last_success_time = time.time()
            
            if self._state == CircuitState.HALF_OPEN:
                self._half_open_successes += 1
                if self._half_open_successes >= self.success_threshold:
                    self._transition_to(CircuitState.CLOSED)
                    logger.info(f"✅ Circuit '{self.name}' recovered!")
    
    async def record_failure(self, error: Optional[Exception] = None):
        """Record a failed request"""
        async with self._lock:
            self._stats.total_requests += 1
            self._stats.failed_requests += 1
            self._stats.consecutive_failures += 1
            self._stats.last_failure_time = time.time()
            
            error_msg = str(error)[:100] if error else "Unknown"
            logger.warning(f"⚠️ Circuit '{self.name}' failure #{self._stats.consecutive_failures}: {error_msg}")
            
            if self._state == CircuitState.HALF_OPEN:
                # Failed during recovery test - back to open
                self._transition_to(CircuitState.OPEN)
            
            elif self._state == CircuitState.CLOSED:
                if self._stats.consecutive_failures >= self.failure_threshold:
                    self._transition_to(CircuitState.OPEN)
                    logger.error(f"🔴 Circuit '{self.name}' OPENED after {self.failure_threshold} failures")
    
    def reset(self):
        """Reset circuit to closed state"""
        self._state = CircuitState.CLOSED
        self._stats = CircuitStats(state_changed_at=time.time())
        self._half_open_successes = 0
        logger.info(f"🔄 Circuit '{self.name}' reset to CLOSED")
    
    def to_dict(self) -> dict:
        """Get circuit status as dictionary"""
        return {
            "name": self.name,
            "state": self._state.value,
            "is_available": self.is_available,
            "stats": {
                "total_requests": self._stats.total_requests,
                "successful_requests": self._stats.successful_requests,
                "failed_requests": self._stats.failed_requests,
                "consecutive_failures": self._stats.consecutive_failures,
                "failure_rate": (
                    self._stats.failed_requests / self._stats.total_requests * 100
                    if self._stats.total_requests > 0 else 0
                )
            },
            "config": {
                "failure_threshold": self.failure_threshold,
                "recovery_timeout": self.recovery_timeout
            }
        }


def with_circuit_breaker(circuit: CircuitBreaker):
    """
    Decorator to wrap async functions with circuit breaker logic.
    
    Usage:
        circuit = CircuitBreaker("my_service")
        
        @with_circuit_breaker(circuit)
        async def call_service():
            # ... service call
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            if not circuit.is_available:
                raise CircuitOpenError(f"Circuit '{circuit.name}' is open")
            
            try:
                result = await func(*args, **kwargs)
                await circuit.record_success()
                return result
            except Exception as e:
                await circuit.record_failure(e)
                raise
        
        return wrapper
    return decorator


class CircuitOpenError(Exception):
    """Raised when circuit is open and request is blocked"""
    pass


# Global registry of circuit breakers
_circuits: dict[str, CircuitBreaker] = {}


def get_circuit(name: str, **kwargs) -> CircuitBreaker:
    """Get or create a circuit breaker by name"""
    if name not in _circuits:
        _circuits[name] = CircuitBreaker(name, **kwargs)
    return _circuits[name]


def get_all_circuits() -> dict[str, CircuitBreaker]:
    """Get all registered circuit breakers"""
    return _circuits.copy()


def reset_all_circuits():
    """Reset all circuit breakers"""
    for circuit in _circuits.values():
        circuit.reset()
