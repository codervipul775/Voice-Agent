'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Activity, X, BarChart3, Users, Zap, Search, Clock, CheckCircle2, AlertCircle, Server, ArrowRightLeft } from 'lucide-react';

interface LatencyStats {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
}

interface ProviderInfo {
  name: string;
  priority: number;
  enabled: boolean;
  available: boolean;
  circuit: {
    state: string;
    is_available: boolean;
    stats: {
      total_requests: number;
      successful_requests: number;
      failed_requests: number;
      consecutive_failures: number;
    };
  };
}

interface ProviderStatus {
  provider_type: string;
  current_provider: string | null;
  fallback_count: number;
  providers: ProviderInfo[];
}

interface ProvidersData {
  providers: {
    stt: ProviderStatus | null;
    llm: ProviderStatus | null;
    tts: ProviderStatus | null;
  };
  summary: {
    stt: { current: string | null; available_count: number };
    llm: { current: string | null; available_count: number };
    tts: { current: string | null; available_count: number };
  };
}

interface LatencyStats {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
}

interface Metrics {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  active_sessions: number;
  error_rate: number;
  latencies: {
    stt: LatencyStats;
    llm: LatencyStats;
    tts: LatencyStats;
    total: LatencyStats;
  };
  search_usage_rate: number;
  timestamp: string;
  recent_requests?: RecentRequest[];
}

interface RecentRequest {
  correlation_id: string;
  session_id: string;
  timestamp: string;
  stt_ms: number;
  llm_ms: number;
  tts_ms: number;
  total_ms: number;
  success: boolean;
  used_search: boolean;
}

interface MetricsDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

const MetricsDashboard: React.FC<MetricsDashboardProps> = ({ isOpen, onClose }) => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [providers, setProviders] = useState<ProvidersData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch provider status
  useEffect(() => {
    if (!isOpen) return;
    
    const fetchProviders = async () => {
      try {
        const res = await fetch('http://localhost:8000/providers');
        if (res.ok) {
          const data = await res.json();
          setProviders(data);
        }
      } catch (e) {
        console.error('Failed to fetch providers:', e);
      }
    };

    fetchProviders();
    const interval = setInterval(fetchProviders, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      if (wsRef.current) {
        wsRef.current.close();
      }
      return;
    }

    const connectWebSocket = () => {
      const ws = new WebSocket('ws://localhost:8000/metrics/ws');
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log('📊 Metrics WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setMetrics(data);
        } catch (e) {
          console.error('Failed to parse metrics:', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log('📊 Metrics WebSocket disconnected');
        if (isOpen) {
          setTimeout(connectWebSocket, 2000);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws.close();
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [isOpen]);

  const formatLatency = (ms: number) => {
    if (ms === 0 || isNaN(ms)) return '-';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getLatencyColor = (ms: number) => {
    if (ms === 0) return 'text-slate-500';
    if (ms < 800) return 'text-cyan-400';
    if (ms < 2000) return 'text-amber-400';
    return 'text-rose-400';
  };

  const LatencyBar: React.FC<{ label: string; stats: LatencyStats; maxWidth?: number; icon: React.ReactNode }> = ({
    label,
    stats,
    maxWidth = 10000,
    icon
  }) => {
    const avg = stats.avg || 0;
    const width = Math.min((avg / maxWidth) * 100, 100);

    return (
      <div className="mb-5 last:mb-0">
        <div className="flex justify-between items-center mb-1.5 px-1">
          <div className="flex items-center gap-2 text-slate-400">
            {icon}
            <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
          </div>
          <span className={`text-xs font-mono font-bold ${getLatencyColor(avg)}`}>
            {formatLatency(avg)}
          </span>
        </div>
        <div className="h-1.5 w-full bg-slate-900/50 rounded-full overflow-hidden border border-white/5">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${avg < 800 ? 'bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : avg < 2000 ? 'bg-amber-500' : 'bg-rose-500'}`}
            style={{ width: `${width}%` }}
          />
        </div>
        <div className="flex gap-4 mt-1.5 px-1 text-[9px] font-mono text-slate-500 uppercase tracking-tight">
          <span>P50: <span className="text-slate-300">{formatLatency(stats.p50)}</span></span>
          <span>P95: <span className="text-slate-300">{formatLatency(stats.p95)}</span></span>
          <span>P99: <span className="text-slate-300">{formatLatency(stats.p99)}</span></span>
        </div>
      </div>
    );
  };

  const StatBox: React.FC<{ label: string; value: string | number; icon: React.ReactNode; colorClass: string }> = ({
    label,
    value,
    icon,
    colorClass
  }) => (
    <div className="bg-white/5 border border-white/5 rounded-xl p-3 flex flex-col gap-1 transition-colors hover:bg-white/10 hover:border-white/15">
      <div className={`p-1.5 rounded-lg w-fit ${colorClass} bg-opacity-20 flex items-center justify-center mb-1`}>
        {icon}
      </div>
      <div className="text-lg font-bold text-white font-heading">{value}</div>
      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider leading-tight">{label}</div>
    </div>
  );

  const ProviderRow: React.FC<{ label: string; current: string | null; count: number; fallbackCount: number }> = ({
    label,
    current,
    count,
    fallbackCount
  }) => (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <div className="flex flex-col">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <div className="flex items-center gap-2 mt-1">
          <span className={`w-1.5 h-1.5 rounded-full ${current ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <span className="text-xs font-mono text-white">{current || 'None'}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {fallbackCount > 0 && (
          <div className="flex items-center gap-1 text-amber-400" title="Fallback switches">
            <ArrowRightLeft className="w-3 h-3" />
            <span className="text-[10px] font-bold">{fallbackCount}</span>
          </div>
        )}
        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-white/5 px-2 py-1 rounded">
          {count}/{count > 0 ? '2' : '0'} ready
        </div>
      </div>
    </div>
  );

  return (
    <div className={`
      h-full z-50 transition-all duration-500 ease-in-out overflow-hidden flex flex-col
      ${isOpen ? 'w-[380px] opacity-100 border-l border-white/10' : 'w-0 opacity-0 border-none'}
      bg-[#080810]/90 backdrop-blur-2xl
    `}>
      {/* Header */}
      <div className="p-5 border-b border-white/10 flex justify-between items-center bg-white/[0.02] min-w-[380px]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-widest">System Metrics</h2>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                {isConnected ? 'Real-time Feed' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar min-w-[380px]">
        {!metrics ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-500">
            <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
            <span className="text-xs font-bold uppercase tracking-widest">Initialize Link...</span>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-700">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <StatBox
                label="Total Ops"
                value={metrics.total_requests}
                icon={<BarChart3 className="w-4 h-4" />}
                colorClass="text-blue-400"
              />
              <StatBox
                label="Success Rate"
                value={`${(100 - metrics.error_rate).toFixed(1)}%`}
                icon={<CheckCircle2 className="w-4 h-4" />}
                colorClass="text-emerald-400"
              />
              <StatBox
                label="Active Sesh"
                value={metrics.active_sessions}
                icon={<Users className="w-4 h-4" />}
                colorClass="text-amber-400"
              />
              <StatBox
                label="Search Flow"
                value={`${metrics.search_usage_rate.toFixed(0)}%`}
                icon={<Search className="w-4 h-4" />}
                colorClass="text-purple-400"
              />
            </div>

            {/* Provider Status Section */}
            {providers && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Server className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400/80">Provider Status</h3>
                </div>
                <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-3">
                  {/* STT Provider */}
                  <ProviderRow 
                    label="Speech-to-Text" 
                    current={providers.summary.stt.current}
                    count={providers.summary.stt.available_count}
                    fallbackCount={providers.providers.stt?.fallback_count || 0}
                  />
                  {/* LLM Provider */}
                  <ProviderRow 
                    label="Language Model" 
                    current={providers.summary.llm.current}
                    count={providers.summary.llm.available_count}
                    fallbackCount={providers.providers.llm?.fallback_count || 0}
                  />
                  {/* TTS Provider */}
                  <ProviderRow 
                    label="Text-to-Speech" 
                    current={providers.summary.tts.current}
                    count={providers.summary.tts.available_count}
                    fallbackCount={providers.providers.tts?.fallback_count || 0}
                  />
                </div>
              </div>
            )}

            {/* Latency Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-cyan-400" />
                <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400/80">Pipeline Latency</h3>
              </div>
              <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4">
                <LatencyBar label="STT Service" stats={metrics.latencies.stt} maxWidth={5000} icon={<Activity className="w-3.5 h-3.5" />} />
                <LatencyBar label="LLM Processing" stats={metrics.latencies.llm} maxWidth={15000} icon={<Zap className="w-3.5 h-3.5" />} />
                <LatencyBar label="TTS Synthesis" stats={metrics.latencies.tts} maxWidth={3000} icon={<Activity className="w-3.5 h-3.5" />} />
                <div className="my-4 border-t border-white/5 opacity-50" />
                <LatencyBar label="End-to-End" stats={metrics.latencies.total} maxWidth={20000} icon={<Clock className="w-3.5 h-3.5" />} />
              </div>
            </div>

            {/* Operation Logs */}
            {metrics.recent_requests && metrics.recent_requests.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-400/80">Operation Logs</h3>
                </div>
                <div className="space-y-2">
                  {metrics.recent_requests.map((req) => (
                    <div key={req.correlation_id} className="bg-white/5 border border-white/5 rounded-xl p-3 flex items-center justify-between transition-colors hover:border-white/10 group">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[10px] text-indigo-300 flex items-center gap-1.5">
                          #{req.correlation_id}
                          {req.used_search && <Search className="w-2.5 h-2.5 text-purple-400" />}
                        </span>
                        <span className="text-[9px] text-slate-500 uppercase tracking-tighter">{req.timestamp}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end">
                          <span className={`text-xs font-mono font-bold ${getLatencyColor(req.total_ms)}`}>
                            {formatLatency(req.total_ms)}
                          </span>
                          <span className="text-[8px] text-slate-600 uppercase">Latency</span>
                        </div>
                        {req.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500/80" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-500/80" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/10 bg-black/20 flex justify-center">
        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.25em]">
          VoiceOS Observability v2.0
        </span>
      </div>
    </div>
  );
};

export default MetricsDashboard;
