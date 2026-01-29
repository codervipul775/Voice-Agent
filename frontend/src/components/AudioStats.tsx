'use client'

import { useVoiceStore } from '@/store/voiceStore'
import { motion } from 'framer-motion'

export default function AudioStats() {
    const { audioMetrics, isConnected, theme } = useVoiceStore()

    if (!isConnected) return null

    if (!audioMetrics) {
        return (
            <div className="w-full flex items-center justify-center p-8 glass-pill opacity-20 text-[var(--text-secondary)]">
                <span className="text-[10px] font-black tracking-[0.3em]">SYNCHRONIZING...</span>
            </div>
        )
    }

    const score = audioMetrics.quality_score;
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;

    const getQualityColor = (s: number) => {
        if (s >= 80) return theme === 'light' ? 'text-cyan-600' : 'text-cyan-400'
        if (s >= 60) return theme === 'light' ? 'text-amber-600' : 'text-amber-400'
        return theme === 'light' ? 'text-rose-600' : 'text-rose-400'
    }

    const getQualityStroke = (s: number) => {
        if (s >= 80) return theme === 'light' ? '#0ea5e9' : '#22d3ee'
        if (s >= 60) return theme === 'light' ? '#d97706' : '#fbbf24'
        return theme === 'light' ? '#e11d48' : '#fb7185'
    }

    return (
        <div className="w-full space-y-8">
            {/* Main Stats Row */}
            <div className="flex items-center gap-6">
                {/* Circular Integrity Indicator */}
                <div className="relative flex items-center justify-center w-24 h-24">
                    <svg className="w-full h-full -rotate-90">
                        <circle
                            cx="48"
                            cy="48"
                            r={radius}
                            fill="transparent"
                            stroke="currentColor"
                            strokeWidth="8"
                            className={theme === 'light' ? 'text-slate-100' : 'text-white/5'}
                        />
                        <motion.circle
                            initial={{ strokeDashoffset: circumference }}
                            animate={{ strokeDashoffset: offset }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            cx="48"
                            cy="48"
                            r={radius}
                            fill="transparent"
                            stroke={getQualityStroke(score)}
                            strokeWidth="8"
                            strokeDasharray={circumference}
                            strokeLinecap="round"
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-xl font-black font-heading tracking-tighter ${getQualityColor(score)}`}>
                            {score}%
                        </span>
                        <span className={`text-[7px] font-black uppercase tracking-widest opacity-40 ${theme === 'light' ? 'text-slate-500' : 'text-white'}`}>Integrity</span>
                    </div>
                </div>

                {/* Vertical Divider */}
                <div className="h-20 w-[1px] bg-[var(--glass-border)] opacity-60" />

                {/* Right Column Stats */}
                <div className="flex-1 space-y-3">
                    {[
                        { label: 'SNR', val: `${audioMetrics.snr_db.toFixed(0)}dB`, color: theme === 'light' ? 'text-cyan-600' : 'text-cyan-400' },
                        { label: 'RMS', val: `${(audioMetrics.rms * 100).toFixed(0)}%`, color: theme === 'light' ? 'text-slate-600' : 'text-[var(--text-secondary)]' },
                        { label: 'PEAK', val: `${(audioMetrics.peak * 100).toFixed(0)}%`, color: theme === 'light' ? 'text-slate-500' : 'text-[var(--text-secondary)] opacity-60' }
                    ].map((stat, i) => (
                        <div key={i} className="flex items-center justify-between">
                            <span className={`text-[8px] font-black tracking-widest uppercase opacity-40 ${theme === 'light' ? 'text-slate-500' : 'text-white'}`}>{stat.label}</span>
                            <span className={`font-mono text-[10px] font-black ${stat.color}`}>{stat.val}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
