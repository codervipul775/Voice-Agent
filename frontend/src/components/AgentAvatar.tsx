'use client'

import { VoiceState } from '@/store/voiceStore'

interface AgentAvatarProps {
    state: VoiceState
    audioLevel: number // 0-1
}

export default function AgentAvatar({ state, audioLevel }: AgentAvatarProps) {

    // Dynamic scale based on audio level
    const audioScale = 1 + (audioLevel * 1.5) // Scale up to 2.5x

    // Color & Glow Config
    const getConfig = () => {
        switch (state) {
            case 'listening':
                return {
                    ring: 'border-emerald-500',
                    core: 'bg-emerald-500',
                    glow: 'shadow-[0_0_80px_rgba(16,185,129,0.3)]'
                }
            case 'speaking':
                return {
                    ring: 'border-cyan-400',
                    core: 'bg-cyan-400',
                    glow: 'shadow-[0_0_100px_rgba(34,211,238,0.4)]'
                }
            case 'thinking':
                return {
                    ring: 'border-indigo-500',
                    core: 'bg-indigo-500',
                    glow: 'shadow-[0_0_80px_rgba(99,102,241,0.3)]'
                }
            case 'error':
                return {
                    ring: 'border-rose-500',
                    core: 'bg-rose-500',
                    glow: 'shadow-[0_0_80px_rgba(244,63,94,0.3)]'
                }
            default: // Idle
                return {
                    ring: 'border-slate-700',
                    core: 'bg-slate-700',
                    glow: 'shadow-none'
                }
        }
    }

    const config = getConfig()

    return (
        <div className="relative flex items-center justify-center w-64 h-64">
            {/* Outer Pulse Rings (when active) */}
            {(state === 'speaking' || state === 'listening') && (
                <>
                    <div className={`absolute inset-0 rounded-full border border-opacity-20 animate-[ping_2s_infinite] ${config.ring}`} />
                    <div className={`absolute inset-4 rounded-full border border-opacity-30 animate-[ping_2s_infinite_0.5s] ${config.ring}`} />
                </>
            )}

            {/* Thinking Spinners */}
            {state === 'thinking' && (
                <div className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            )}

            {/* Main Core Orb */}
            <div
                className={`
          relative z-10 
          w-32 h-32 rounded-full 
          flex items-center justify-center
          transition-all duration-300 ease-out
          ${config.core}
          ${config.glow}
        `}
                style={{
                    transform: state === 'speaking' || state === 'listening' ? `scale(${audioScale})` : 'scale(1)'
                }}
            >
                {/* Inner detail */}
                <div className="w-full h-full rounded-full bg-gradient-to-tr from-white/20 to-transparent blur-sm" />
            </div>

        </div>
    )
}
