'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Activity, X, BarChart3, Users, Zap, Search, Clock, CheckCircle2, Sparkles, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVoiceStore } from '@/store/voiceStore';

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
  isOpen?: boolean;
  onClose?: () => void;
  embedded?: boolean;
}

const MetricsDashboard = React.forwardRef<HTMLElement, MetricsDashboardProps>(({ isOpen, onClose, embedded }, ref) => {
  const { theme } = useVoiceStore()
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const shouldBeOpen = embedded || isOpen;

  useEffect(() => {
    if (!shouldBeOpen) {
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
        if (shouldBeOpen) setTimeout(connectWebSocket, 2000);
      };
      ws.onerror = () => ws.close();
    };

    connectWebSocket();
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [shouldBeOpen]);

  const formatLatency = (ms: number) => {
    if (ms === 0 || isNaN(ms)) return '-';
    return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
  };

  const getLatencyColor = (ms: number) => {
    if (ms === 0) return theme === 'light' ? 'text-slate-300' : 'text-white/20';
    if (ms < 800) return theme === 'light' ? 'text-cyan-600' : 'text-cyan-400';
    if (ms < 2000) return theme === 'light' ? 'text-amber-600' : 'text-amber-400';
    return theme === 'light' ? 'text-rose-600' : 'text-rose-400';
  };

  const LatencyBar: React.FC<{ label: string; stats: LatencyStats; maxWidth?: number; icon: React.ReactNode }> = ({
    label, stats, maxWidth = 10000, icon
  }) => {
    const avg = stats.avg || 0;
    const width = Math.min((avg / maxWidth) * 100, 100);

    return (
      <div className="mb-4 last:mb-0">
        <div className="flex justify-between items-center mb-1.5 px-1">
          <div className={`flex items-center gap-2 ${theme === 'light' ? 'text-slate-500 font-bold' : 'text-[var(--text-secondary)] font-bold'}`}>
            {icon}
            <span className="text-[9px] font-black uppercase tracking-[0.2em]">{label}</span>
          </div>
          <span className={`text-[10px] font-mono font-black ${getLatencyColor(avg)}`}>
            {formatLatency(avg)}
          </span>
        </div>
        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden" style={{ backgroundColor: theme === 'light' ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.05)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${width}%` }}
            className={`h-full rounded-full ${avg < 800 ? (theme === 'light' ? 'bg-cyan-600' : 'bg-cyan-400') : avg < 2000 ? (theme === 'light' ? 'bg-amber-600' : 'bg-amber-400') : (theme === 'light' ? 'bg-rose-600' : 'bg-rose-400')}`}
          />
        </div>
      </div>
    );
  };

  const StatBox: React.FC<{ label: string; value: string | number; icon: React.ReactNode; color: string }> = ({
    label, value, icon, color
  }) => (
    <motion.div
      layout
      className="glass-panel rounded-2xl p-4 flex flex-col gap-1 relative overflow-hidden group"
    >
      <div className={`p-1.5 rounded-lg w-fit flex items-center justify-center mb-1 ${color} ${theme === 'light' ? 'bg-slate-100' : 'bg-[var(--accent-primary)]/5'}`}>
        {React.cloneElement(icon as React.ReactElement, { className: 'w-4 h-4' })}
      </div>
      <div className="text-xl font-black text-[var(--text-primary)] font-heading tracking-tighter">{value}</div>
      <div className={`text-[8px] font-black uppercase tracking-[0.3em] ${theme === 'light' ? 'text-slate-500 opacity-70' : 'text-[var(--text-secondary)] opacity-40'}`}>{label}</div>
    </motion.div>
  );

  const DashboardContent = () => (
    <div className={`flex-1 overflow-y-auto no-scrollbar space-y-6 ${embedded ? 'p-6 glass-panel rounded-[2rem] border-[var(--glass-border)]' : 'p-10'}`}>
      {!metrics ? (
        <div className={`h-full flex flex-col items-center justify-center gap-6 ${theme === 'light' ? 'opacity-30' : 'opacity-20'}`}>
          <Sparkles className="w-10 h-10 animate-pulse" />
          <span className="text-[9px] font-black uppercase tracking-[0.5em]">Linking Observability...</span>
        </div>
      ) : (
        <motion.div layout className="space-y-6">
          {/* Main Title if embedded */}
          {embedded && (
            <div className="flex items-center gap-3 mb-2 px-1">
              <BarChart3 className={`w-4 h-4 ${theme === 'light' ? 'text-cyan-600' : 'text-cyan-400'}`} />
              <h3 className={`text-[10px] font-black uppercase tracking-[0.4em] ${theme === 'light' ? 'text-slate-500 opacity-70' : 'text-[var(--text-secondary)] opacity-60'}`}>TELEMETRY_MATRIX</h3>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatBox label="TOTAL_LOGS" value={metrics.total_requests} icon={<BarChart3 />} color="text-cyan-600" />
            <StatBox label="SUCCESS" value={`${(100 - metrics.error_rate).toFixed(1)}%`} icon={<CheckCircle2 />} color="text-emerald-600" />
            <StatBox label="ACTIVE_SES" value={metrics.active_sessions} icon={<Users />} color="text-purple-600" />
            <StatBox label="LATENCY" value={formatLatency(metrics.latencies.total.avg)} icon={<Zap />} color="text-amber-600" />
          </div>

          {/* Pipeline Latency */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Zap className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-cyan-600' : 'text-cyan-400'}`} />
              <h3 className={`text-[9px] font-black uppercase tracking-[0.4em] ${theme === 'light' ? 'text-slate-500 opacity-70' : 'text-[var(--text-secondary)] opacity-60'}`}>Latency Matrix</h3>
            </div>
            <div className="glass-panel p-6 rounded-[1.5rem] space-y-1.5 border-[var(--glass-border)]">
              <LatencyBar label="STT Service" stats={metrics.latencies.stt} maxWidth={5000} icon={<Activity className="w-3 h-3" />} />
              <LatencyBar label="LLM Synth" stats={metrics.latencies.llm} maxWidth={15000} icon={<Zap className="w-3 h-3" />} />
              <LatencyBar label="TTS Vocodes" stats={metrics.latencies.tts} maxWidth={3000} icon={<Activity className="w-3 h-3" />} />
            </div>
          </div>

          {/* Event Cluster */}
          {metrics.recent_requests && metrics.recent_requests.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Radio className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-purple-600' : 'text-purple-400'}`} />
                <h3 className={`text-[9px] font-black uppercase tracking-[0.4em] ${theme === 'light' ? 'text-slate-500 opacity-70' : 'text-[var(--text-secondary)] opacity-60'}`}>Cluster Events</h3>
              </div>
              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {metrics.recent_requests.slice(0, 4).map((req) => (
                    <motion.div
                      key={req.correlation_id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="glass-panel p-3 rounded-2xl flex items-center justify-between border-[var(--glass-border)]"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className={`font-mono text-[8px] font-black ${theme === 'light' ? 'text-cyan-600/70' : 'text-cyan-400/60'}`}>ID_{req.correlation_id.slice(0, 6)}</span>
                        <span className={`text-[7px] font-bold ${theme === 'light' ? 'text-slate-400 opacity-70' : 'text-[var(--text-secondary)] opacity-50'}`}>{req.timestamp}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-[9px] font-mono font-black ${getLatencyColor(req.total_ms)}`}>
                          {formatLatency(req.total_ms)}
                        </span>
                        {req.success ? <div className={`w-1 h-1 rounded-full ${theme === 'light' ? 'bg-cyan-600' : 'bg-cyan-400'}`} /> : <div className="w-1 h-1 rounded-full bg-rose-500" />}
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
  );

  if (embedded) {
    return <DashboardContent />;
  }

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
          className="w-[400px] h-full glass-panel rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl relative z-20"
        >
          {/* Header for Standalone Sidebar */}
          <div className="p-10 border-b border-[var(--glass-border)] flex justify-between items-center" style={{ backgroundColor: theme === 'light' ? 'rgba(248, 250, 252, 0.4)' : 'rgba(2, 4, 10, 0.4)' }}>
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${theme === 'light' ? 'bg-cyan-500/15 text-cyan-600' : 'bg-cyan-500/10 text-cyan-400'}`}>
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-[0.4em]">Neural Telemetry</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`w-1 h-1 rounded-full ${isConnected ? (theme === 'light' ? 'bg-cyan-600 animate-pulse' : 'bg-cyan-400 animate-pulse') : 'bg-rose-500'}`} />
                  <span className={`text-[8px] font-black uppercase tracking-widest ${theme === 'light' ? 'text-slate-500 opacity-70' : 'text-[var(--text-secondary)] opacity-40'}`}>
                    {isConnected ? 'LIVE FEED ACTIVE' : 'SIGNAL LOST'}
                  </span>
                </div>
              </div>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className={`p-3 rounded-2xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all transform hover:rotate-90 ${theme === 'light' ? 'hover:bg-slate-200' : 'hover:bg-[var(--accent-primary)]/5'}`}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <DashboardContent />

          <div className="p-8 border-t border-[var(--glass-border)] flex justify-center" style={{ backgroundColor: theme === 'light' ? 'rgba(248, 250, 252, 0.4)' : 'rgba(2, 4, 10, 0.4)' }}>
            <span className={`text-[9px] font-black uppercase tracking-[0.5em] ${theme === 'light' ? 'text-slate-400 opacity-40' : 'text-[var(--text-secondary)] opacity-20'}`}>Neural Link Observability Suite</span>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
});

MetricsDashboard.displayName = 'MetricsDashboard';

export default MetricsDashboard;
