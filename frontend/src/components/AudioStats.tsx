'use client'

import { useVoiceStore } from '@/store/voiceStore'

export default function AudioStats() {
  const { audioMetrics, vadStatus, isConnected } = useVoiceStore()

  // Show simplified version if no metrics
  if (!isConnected) return null

  if (!audioMetrics) {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-3 text-xs">
          <span className="text-slate-500 uppercase font-bold">Status</span>
          <div className="flex items-center gap-2 px-2 py-0.5 rounded-full border bg-slate-800 border-slate-700 text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            Waiting for audio...
          </div>
        </div>
      </div>
    )
  }

  const getQualityColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400'
    if (score >= 60) return 'text-yellow-400'
    return 'text-rose-400'
  }

  return (
    <div className="w-full">
      {/* VAD Status Pill */}
      <div className="flex items-center justify-between mb-3 text-xs">
        <span className="text-slate-500 uppercase font-bold">Status</span>
        <div className={`
          flex items-center gap-2 px-2 py-0.5 rounded-full border
          ${vadStatus?.is_speech
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-slate-800 border-slate-700 text-slate-400'}
        `}>
          <span className={`w-1.5 h-1.5 rounded-full ${vadStatus?.is_speech ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
          {vadStatus?.is_speech ? 'Speech Detected' : 'Silence'}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-2 gap-3">

        {/* Quality Score */}
        <div className="bg-slate-950/30 border border-white/5 rounded-lg p-3 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-emerald-500 to-cyan-500 opacity-50" />
          <div className="flex flex-col h-full justify-between">
            <span className="text-[10px] text-slate-500 uppercase font-bold">Signal Quality</span>
            <div className="text-right">
              <span className={`text-2xl font-mono font-bold ${getQualityColor(audioMetrics.quality_score)}`}>
                {audioMetrics.quality_score}
              </span>
              <span className="text-[10px] text-slate-600 block leading-none">{audioMetrics.quality_label}</span>
            </div>
          </div>
        </div>

        {/* Mini Metrics */}
        <div className="grid grid-rows-3 gap-1.5">
          <div className="flex items-center justify-between px-2 py-1 bg-slate-950/30 rounded border border-white/5">
            <span className="text-[10px] text-slate-500 uppercase">SNR</span>
            <span className={`font-mono text-xs font-bold ${audioMetrics.snr_db > 20 ? 'text-emerald-400' : 'text-yellow-400'}`}>
              {audioMetrics.snr_db.toFixed(0)}dB
            </span>
          </div>

          <div className="flex items-center justify-between px-2 py-1 bg-slate-950/30 rounded border border-white/5">
            <span className="text-[10px] text-slate-500 uppercase">Vol</span>
            <span className="font-mono text-xs font-bold text-cyan-400">
              {(audioMetrics.rms * 100).toFixed(0)}%
            </span>
          </div>

          <div className="flex items-center justify-between px-2 py-1 bg-slate-950/30 rounded border border-white/5">
            <span className="text-[10px] text-slate-500 uppercase">Peak</span>
            <span className="font-mono text-xs font-bold text-slate-300">
              {(audioMetrics.peak * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
