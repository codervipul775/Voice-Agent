'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Activity, X, BarChart3, Users, Zap, Search, Clock, CheckCircle2, Sparkles, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

const MetricsDashboard = React.forwardRef<HTMLElement, MetricsDashboardProps>(({ isOpen, onClose }, ref) => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (wsRef.current) wsRef.current.close();
      return;
    }

    const connectWebSocket = () => {
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';
      const ws = new WebSocket(`${wsUrl}/metrics/ws`);
      wsRef.current = ws;

      ws.onopen = () => setIsConnected(true);
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
        if (isOpen) setTimeout(connectWebSocket, 2000);
      };
      ws.onerror = () => ws.close();
    };

    connectWebSocket();
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [isOpen]);

  const formatLatency = (ms: number) => {
    if (ms === 0 || isNaN(ms)) return '-';
    return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
  };

  const getLatencyColor = (ms: number) => {
    if (ms === 0) return 'text-white/20';
    if (ms < 800) return 'text-cyan-400';
    if (ms < 2000) return 'text-amber-400';
    return 'text-rose-400';
  };

  const LatencyBar: React.FC<{ label: string; stats: LatencyStats; maxWidth?: number; icon: React.ReactNode }> = ({
    label, stats, maxWidth = 10000, icon
  }) => {
    const avg = stats.avg || 0;
    const width = Math.min((avg / maxWidth) * 100, 100);

    return (
      <div className="mb-6 last:mb-0">
        <div className="flex justify-between items-center mb-2 px-1">
          <div className="flex items-center gap-2 text-white/40">
            {icon}
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{label}</span>
          </div>
          <span className={`text-[11px] font-mono font-black ${getLatencyColor(avg)}`}>
            {formatLatency(avg)}
          </span>
        </div>
        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${width}%` }}
            className={`h-full rounded-full ${avg < 800 ? 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : avg < 2000 ? 'bg-amber-400' : 'bg-rose-400'}`}
          />
        </div>
        <div className="flex gap-4 mt-2 px-1 text-[8px] font-black font-mono text-white/10 uppercase tracking-widest">
          <span>P50: <span className="text-white/30">{formatLatency(stats.p50)}</span></span>
          <span>P95: <span className="text-white/30">{formatLatency(stats.p95)}</span></span>
        </div>
      </div>
    );
  };

  const StatBox: React.FC<{ label: string; value: string | number; icon: React.ReactNode; color: string }> = ({
    label, value, icon, color
  }) => (
    <motion.div
      layout
      className="glass-panel rounded-3xl p-5 flex flex-col gap-2 relative overflow-hidden group"
    >
      <div className={`p-2 rounded-xl w-fit bg-white/5 ${color} flex items-center justify-center mb-2`}>
        {icon}
      </div>
      <div className="text-2xl font-black text-white font-heading tracking-tighter">{value}</div>
      <div className="text-[9px] text-white/20 font-black uppercase tracking-[0.3em]">{label}</div>
      <div className={`absolute top-0 right-0 w-16 h-16 opacity-5 bg-gradient-to-br from-white to-transparent`} />
    </motion.div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          key="metrics-dashboard"
          ref={ref as React.Ref<HTMLElement>}
          initial={{ x: 400, opacity: 0, scale: 0.95 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          exit={{ x: 400, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="w-[400px] h-[calc(100vh-4rem)] m-8 ml-0 glass-panel rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl relative z-20"
        >
          {/* Header */}
          <div className="p-10 border-b border-white/5 flex justify-between items-center bg-black/20">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xs font-black text-white uppercase tracking-[0.4em]">Neural Telemetry</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`w-1 h-1 rounded-full ${isConnected ? 'bg-cyan-400 animate-pulse' : 'bg-rose-500'}`} />
                  <span className="text-[8px] font-black uppercase tracking-widest text-white/20">
                    {isConnected ? 'LIVE FEED ACTIVE' : 'SIGNAL LOST'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-3 rounded-2xl hover:bg-white/5 text-white/20 hover:text-white transition-all transform hover:rotate-90"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-12">
            {!metrics ? (
              <div className="h-full flex flex-col items-center justify-center gap-6 opacity-20">
                <Sparkles className="w-12 h-12 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.5em]">Linking Observability...</span>
              </div>
            ) : (
              <motion.div layout className="space-y-12">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <StatBox label="TOTAL_LOGS" value={metrics.total_requests} icon={<BarChart3 className="w-5 h-5" />} color="text-cyan-400" />
                  <StatBox label="SUCCESS_RATE" value={`${(100 - metrics.error_rate).toFixed(1)}%`} icon={<CheckCircle2 className="w-5 h-5" />} color="text-emerald-400" />
                  <StatBox label="ACTIVE_SES" value={metrics.active_sessions} icon={<Users className="w-5 h-5" />} color="text-purple-400" />
                  <StatBox label="SEARCH_LOAD" value={`${metrics.search_usage_rate.toFixed(0)}%`} icon={<Search className="w-5 h-5" />} color="text-amber-400" />
                </div>

                {/* Pipeline Latency */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <Zap className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Latency Matrix</h3>
                  </div>
                  <div className="glass-panel p-8 rounded-[2rem] space-y-2 border-white/5">
                    <LatencyBar label="STT Service" stats={metrics.latencies.stt} maxWidth={5000} icon={<Activity className="w-3.5 h-3.5" />} />
                    <LatencyBar label="LLM Synth" stats={metrics.latencies.llm} maxWidth={15000} icon={<Zap className="w-3.5 h-3.5" />} />
                    <LatencyBar label="TTS Vocodes" stats={metrics.latencies.tts} maxWidth={3000} icon={<Activity className="w-3.5 h-3.5" />} />
                    <div className="py-4"><div className="h-[1px] w-full bg-white/5" /></div>
                    <LatencyBar label="End-to-End" stats={metrics.latencies.total} maxWidth={20000} icon={<Clock className="w-3.5 h-3.5" />} />
                  </div>
                </div>

                {/* Event Cluster */}
                {metrics.recent_requests && metrics.recent_requests.length > 0 && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <Radio className="w-4 h-4 text-purple-400" />
                      <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Recent Cluster Events</h3>
                    </div>
                    <div className="space-y-3">
                      <AnimatePresence mode="popLayout">
                        {metrics.recent_requests.map((req) => (
                          <motion.div
                            key={req.correlation_id}
                            layout
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            whileHover={{ x: 4 }}
                            className="glass-panel p-4 rounded-3xl flex items-center justify-between border-white/5"
                          >
                            <div className="flex flex-col gap-1">
                              <span className="font-mono text-[9px] text-cyan-400/60 font-black">ID_{req.correlation_id.slice(0, 8)}</span>
                              <span className="text-[8px] text-white/10 font-bold">{req.timestamp}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className={`text-[11px] font-mono font-black ${getLatencyColor(req.total_ms)}`}>
                                {formatLatency(req.total_ms)}
                              </span>
                              {req.success ? <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> : <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </div>

          <div className="p-8 border-t border-white/5 bg-black/40 flex justify-center">
            <span className="text-[9px] font-black text-white/10 uppercase tracking-[0.5em]">Neural Link Observability Suite</span>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
});

MetricsDashboard.displayName = 'MetricsDashboard';

export default MetricsDashboard;

