'use client'

import { useVoiceStore } from '@/store/voiceStore'
import { motion } from 'framer-motion'

export default function AudioStats() {
    const { audioMetrics, vadStatus, isConnected } = useVoiceStore()

    if (!isConnected) return null

    if (!audioMetrics) {
        return (
            <div className="w-full flex items-center justify-center p-8 glass-pill opacity-20">
                <span className="text-[10px] font-black tracking-[0.3em]">SYNCHRONIZING...</span>
            </div>
        )
    }

    const getQualityColor = (score: number) => {
        if (score >= 80) return 'text-cyan-400'
        if (score >= 60) return 'text-amber-400'
        return 'text-rose-400'
    }

    return (
        <div className="w-full space-y-6">
            {/* VAD Status Pill */}
            <div className="flex items-center justify-between">
                <span className="text-[9px] text-white/20 font-black uppercase tracking-[0.2em]">Neural State</span>
                <motion.div
                    animate={{ scale: vadStatus?.is_speech ? [1, 1.05, 1] : 1 }}
                    className={`
                px-3 py-1 rounded-full border glass-pill flex items-center gap-2
                ${vadStatus?.is_speech ? 'border-cyan-500/30' : 'border-white/5'}
            `}
                >
                    <div className={`w-1 h-1 rounded-full ${vadStatus?.is_speech ? 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)] animate-pulse' : 'bg-white/10'}`} />
                    <span className={`text-[10px] font-black tracking-widest ${vadStatus?.is_speech ? 'text-cyan-400' : 'text-white/20'}`}>
                        {vadStatus?.is_speech ? 'SPEECH_ACTIVE' : 'IDLE_SILENCE'}
                    </span>
                </motion.div>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-2 gap-4">
                <div className="glass-panel p-5 rounded-3xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-cyan-500/10 to-transparent pointer-events-none" />
                    <span className="text-[8px] text-white/20 font-black uppercase tracking-widest mb-2 block">Integrity</span>
                    <div className="flex items-baseline gap-1">
                        <span className={`text-3xl font-heading font-black tracking-tighter ${getQualityColor(audioMetrics.quality_score)}`}>
                            {audioMetrics.quality_score}
                        </span>
                        <span className="text-[10px] text-white/20 font-mono">%</span>
                    </div>
                    <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${audioMetrics.quality_score}%` }}
                            className="h-full bg-cyan-400"
                        />
                    </div>
                </div>

                <div className="space-y-3">
                    {[
                        { label: 'SNR', val: `${audioMetrics.snr_db.toFixed(0)}dB`, color: 'text-cyan-400' },
                        { label: 'RMS', val: `${(audioMetrics.rms * 100).toFixed(0)}%`, color: 'text-white/60' },
                        { label: 'PEAK', val: `${(audioMetrics.peak * 100).toFixed(0)}%`, color: 'text-white/40' }
                    ].map((stat, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-2xl glass-pill">
                            <span className="text-[8px] text-white/20 font-black tracking-widest uppercase">{stat.label}</span>
                            <span className={`font-mono text-[11px] font-bold ${stat.color}`}>{stat.val}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

