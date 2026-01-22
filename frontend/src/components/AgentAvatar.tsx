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
                    ring: 'border-emerald-500/50',
                    core: 'bg-emerald-500',
                    glow: 'shadow-[0_0_80px_rgba(16,185,129,0.4)]',
                    inner: 'bg-emerald-300'
                }
            case 'speaking':
                return {
                    ring: 'border-cyan-400/50',
                    core: 'bg-gradient-to-br from-cyan-400 to-blue-600',
                    glow: 'shadow-[0_0_100px_rgba(34,211,238,0.5)]',
                    inner: 'bg-cyan-200'
                }
            case 'thinking':
                return {
                    ring: 'border-indigo-500/50',
                    core: 'bg-indigo-500',
                    glow: 'shadow-[0_0_80px_rgba(99,102,241,0.4)]',
                    inner: 'bg-indigo-300'
                }
            case 'error':
                return {
                    ring: 'border-rose-500/50',
                    core: 'bg-rose-500',
                    glow: 'shadow-[0_0_80px_rgba(244,63,94,0.4)]',
                    inner: 'bg-rose-300'
                }
            default: // Idle
                return {
                    ring: 'border-slate-800',
                    core: 'bg-slate-800',
                    glow: 'shadow-none',
                    inner: 'bg-slate-700'
                }
        }
    }

    const config = getConfig()

    return (
        <div className="relative flex items-center justify-center w-80 h-80">
            {/* Outer Pulse Rings (when active) */}
            {(state === 'speaking' || state === 'listening') && (
                <>
                    <div className={`absolute inset-0 rounded-full border-2 animate-[ping_3s_infinite] ${config.ring}`} />
                    <div className={`absolute inset-8 rounded-full border animate-[ping_3s_infinite_1s] ${config.ring}`} />
                </>
            )}

            {/* Main Core Orb */}
            <div
                className={`
          relative z-10 
          w-40 h-40 rounded-full 
          flex items-center justify-center
          transition-all duration-700 cubic-bezier(0.175, 0.885, 0.32, 1.275)
          ${config.core}
          ${config.glow}
          border-4 border-white/20
        `}
                style={{
                    transform: state === 'speaking' || state === 'listening' ? `scale(${audioScale})` : 'scale(1)'
                }}
            >
                {/* Inner detail for depth */}
                <div className={`w-[85%] h-[85%] rounded-full bg-gradient-to-tr from-white/30 to-transparent blur-[2px]`} />

                {/* Shiny point */}
                <div className={`absolute top-[20%] left-[25%] w-4 h-4 rounded-full ${config.inner} blur-[8px] opacity-80`} />
            </div>

            {/* Thinking Spinners */}
            {state === 'thinking' && (
                <div className="absolute inset-10 rounded-full border-2 border-dashed border-indigo-400/50 animate-[spin_4s_linear_infinite]" />
            )}

        </div>
    )
}
