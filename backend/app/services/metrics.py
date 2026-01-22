"""
Metrics Collector Service
Tracks pipeline latencies, request counts, and performance metrics.
"""
import time
import logging
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from collections import deque
from datetime import datetime
import statistics

logger = logging.getLogger(__name__)


@dataclass
class PipelineMetrics:
    """Metrics for a single request through the pipeline"""
    correlation_id: str
    session_id: str
    user_id: str
    timestamp: float = field(default_factory=time.time)
    
    # Latencies in milliseconds
    stt_latency_ms: float = 0
    llm_latency_ms: float = 0
    tts_latency_ms: float = 0
    search_latency_ms: float = 0
    total_latency_ms: float = 0
    
    # Status
    success: bool = True
    error_message: str = ""
    used_search: bool = False


class MetricsCollector:
    """Collects and aggregates metrics for the voice pipeline"""
    
    def __init__(self, max_history: int = 1000):
        self.max_history = max_history
        self.metrics_history: deque[PipelineMetrics] = deque(maxlen=max_history)
        
        # Counters
        self.total_requests = 0
        self.successful_requests = 0
        self.failed_requests = 0
        self.active_sessions = 0
        
        # Current in-flight requests
        self._in_flight: Dict[str, Dict] = {}
    
    def start_request(self, correlation_id: str, session_id: str, user_id: str = ""):
        """Start tracking a new request"""
        self._in_flight[correlation_id] = {
            "session_id": session_id,
            "user_id": user_id,
            "start_time": time.time(),
            "stages": {}
        }
        self.total_requests += 1
        logger.debug(f"📊 Started tracking: {correlation_id}")
    
    def start_stage(self, correlation_id: str, stage: str):
        """Start timing a pipeline stage"""
        if correlation_id in self._in_flight:
            self._in_flight[correlation_id]["stages"][stage] = {
                "start": time.time(),
                "end": None
            }
    
    def end_stage(self, correlation_id: str, stage: str):
        """End timing a pipeline stage"""
        if correlation_id in self._in_flight:
            stages = self._in_flight[correlation_id]["stages"]
            if stage in stages:
                stages[stage]["end"] = time.time()
    
    def end_request(
        self, 
        correlation_id: str, 
        success: bool = True, 
        error_message: str = "",
        used_search: bool = False
    ):
        """Complete tracking for a request"""
        if correlation_id not in self._in_flight:
            return
        
        data = self._in_flight.pop(correlation_id)
        end_time = time.time()
        
        # Calculate latencies
        metrics = PipelineMetrics(
            correlation_id=correlation_id,
            session_id=data["session_id"],
            user_id=data["user_id"],
            timestamp=data["start_time"],
            success=success,
            error_message=error_message,
            used_search=used_search,
            total_latency_ms=(end_time - data["start_time"]) * 1000
        )
        
        # Calculate stage latencies
        for stage, times in data["stages"].items():
            if times["end"] is not None:
                latency_ms = (times["end"] - times["start"]) * 1000
                if stage == "stt":
                    metrics.stt_latency_ms = latency_ms
                elif stage == "llm":
                    metrics.llm_latency_ms = latency_ms
                elif stage == "tts":
                    metrics.tts_latency_ms = latency_ms
                elif stage == "search":
                    metrics.search_latency_ms = latency_ms
        
        # Update counters
        if success:
            self.successful_requests += 1
        else:
            self.failed_requests += 1
        
        # Store metrics
        self.metrics_history.append(metrics)
        
        logger.info(
            f"📊 Request complete: {correlation_id} | "
            f"STT={metrics.stt_latency_ms:.0f}ms, "
            f"LLM={metrics.llm_latency_ms:.0f}ms, "
            f"TTS={metrics.tts_latency_ms:.0f}ms, "
            f"Total={metrics.total_latency_ms:.0f}ms"
        )
    
    def set_active_sessions(self, count: int):
        """Update active session count"""
        self.active_sessions = count
    
    def get_percentile(self, values: List[float], percentile: float) -> float:
        """Calculate percentile from a list of values"""
        if not values:
            return 0.0
        sorted_values = sorted(values)
        index = int(len(sorted_values) * percentile / 100)
        return sorted_values[min(index, len(sorted_values) - 1)]
    
    def get_stats(self, last_n: int = 100) -> Dict:
        """Get aggregated statistics"""
        recent = list(self.metrics_history)[-last_n:]
        
        if not recent:
            return {
                "total_requests": self.total_requests,
                "successful_requests": self.successful_requests,
                "failed_requests": self.failed_requests,
                "active_sessions": self.active_sessions,
                "error_rate": 0.0,
                "latencies": {
                    "stt": {"p50": 0, "p95": 0, "p99": 0, "avg": 0},
                    "llm": {"p50": 0, "p95": 0, "p99": 0, "avg": 0},
                    "tts": {"p50": 0, "p95": 0, "p99": 0, "avg": 0},
                    "total": {"p50": 0, "p95": 0, "p99": 0, "avg": 0},
                },
                "search_usage_rate": 0.0,
                "timestamp": datetime.now().isoformat()
            }
        
        # Calculate latency stats
        stt_latencies = [m.stt_latency_ms for m in recent if m.stt_latency_ms > 0]
        llm_latencies = [m.llm_latency_ms for m in recent if m.llm_latency_ms > 0]
        tts_latencies = [m.tts_latency_ms for m in recent if m.tts_latency_ms > 0]
        total_latencies = [m.total_latency_ms for m in recent if m.total_latency_ms > 0]
        
        def calc_stats(values: List[float]) -> Dict:
            if not values:
                return {"p50": 0, "p95": 0, "p99": 0, "avg": 0}
            return {
                "p50": round(self.get_percentile(values, 50), 1),
                "p95": round(self.get_percentile(values, 95), 1),
                "p99": round(self.get_percentile(values, 99), 1),
                "avg": round(statistics.mean(values), 1)
            }
        
        search_count = sum(1 for m in recent if m.used_search)
        
        return {
            "total_requests": self.total_requests,
            "successful_requests": self.successful_requests,
            "failed_requests": self.failed_requests,
            "active_sessions": self.active_sessions,
            "error_rate": round(self.failed_requests / max(self.total_requests, 1) * 100, 2),
            "latencies": {
                "stt": calc_stats(stt_latencies),
                "llm": calc_stats(llm_latencies),
                "tts": calc_stats(tts_latencies),
                "total": calc_stats(total_latencies),
            },
            "search_usage_rate": round(search_count / len(recent) * 100, 2),
            "timestamp": datetime.now().isoformat()
        }
    
    def get_recent_requests(self, limit: int = 10) -> List[Dict]:
        """Get recent request details"""
        recent = list(self.metrics_history)[-limit:]
        return [
            {
                "correlation_id": m.correlation_id,
                "session_id": m.session_id[:8] + "...",
                "timestamp": datetime.fromtimestamp(m.timestamp).strftime("%H:%M:%S"),
                "stt_ms": round(m.stt_latency_ms),
                "llm_ms": round(m.llm_latency_ms),
                "tts_ms": round(m.tts_latency_ms),
                "total_ms": round(m.total_latency_ms),
                "success": m.success,
                "used_search": m.used_search
            }
            for m in reversed(recent)
        ]


# Singleton instance
metrics_collector = MetricsCollector()
