'use client'

import { VoiceState } from '@/store/voiceStore'
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion'
import { useEffect } from 'react'

interface AgentAvatarProps {
    state: VoiceState
    audioLevel: number // 0-1
}

export default function AgentAvatar({ state, audioLevel }: AgentAvatarProps) {
    // Smoothed motion value for audio level
    const smoothLevel = useSpring(audioLevel, {
        stiffness: 300,
        damping: 30,
        mass: 0.5
    })

    // Update spring whenever audioLevel prop changes
    useEffect(() => {
        smoothLevel.set(audioLevel)
    }, [audioLevel, smoothLevel])

    // Transform level to scale
    const audioScale = useTransform(smoothLevel, [0, 1], [1, 1.8])

    const getConfig = () => {
        switch (state) {
            case 'listening':
                return {
                    color: 'var(--accent-success)',
                    glow: 'rgba(0, 255, 136, 0.4)',
                    label: 'LISTENING',
                    blur: 'blur-xl'
                }
            case 'speaking':
                return {
                    color: 'var(--accent-primary)',
                    glow: 'rgba(0, 242, 255, 0.5)',
                    label: 'SPEAKING',
                    blur: 'blur-2xl'
                }
            case 'thinking':
                return {
                    color: 'var(--accent-secondary)',
                    glow: 'rgba(112, 0, 255, 0.4)',
                    label: 'THINKING',
                    blur: 'blur-lg'
                }
            case 'error':
                return {
                    color: 'var(--accent-error)',
                    glow: 'rgba(255, 45, 85, 0.4)',
                    label: 'ERROR',
                    blur: 'blur-md'
                }
            default:
                return {
                    color: 'var(--text-secondary)',
                    glow: 'rgba(71, 85, 105, 0.1)',
                    label: 'IDLE',
                    blur: 'blur-sm'
                }
        }
    }

    const config = getConfig()

    return (
        <div className="relative flex items-center justify-center w-96 h-96">
            {/* Ambient Base Glow */}
            <motion.div
                animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.1, 0.2, 0.1],
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: config.color, filter: 'blur(80px)' }}
            />

            {/* Pulsing Energy Rings */}
            <AnimatePresence>
                {(state === 'listening' || state === 'speaking') && (
                    <>
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1.5, opacity: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                            className="absolute inset-0 rounded-full border border-[var(--glass-border)] opacity-30"
                        />
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 2, opacity: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 3, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
                            className="absolute inset-0 rounded-full border border-[var(--glass-border)] opacity-20"
                        />
                    </>
                )}
            </AnimatePresence>

            {/* Main Central Orb */}
            <motion.div
                style={{
                    scale: audioScale,
                }}
                animate={{
                    rotate: state === 'thinking' ? 360 : 0
                }}
                transition={{
                    rotate: { duration: 4, repeat: Infinity, ease: "linear" }
                }}
                className="relative z-20 w-48 h-48 rounded-full shadow-2xl glass-panel group overflow-hidden"
            >
                {/* Internal Energy Fluid */}
                <div
                    className={`absolute inset-0 opacity-40 transition-colors duration-700 ${config.blur}`}
                    style={{
                        background: `radial-gradient(circle at 30% 30%, ${config.color}, transparent 70%)`
                    }}
                />

                {/* Rotating Scanline/Highlight */}
                <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent rotate-45 pointer-events-none" />

                {/* Core Nucleus */}
                <motion.div
                    animate={{
                        scale: [1, 1.1, 1],
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-[30%] rounded-full opacity-80"
                    style={{
                        background: `radial-gradient(circle, ${config.color} 0%, transparent 100%)`,
                        boxShadow: `0 0 40px ${config.glow}`
                    }}
                />

                {/* Cyber Mesh Texture */}
                <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] mix-blend-overlay" />
            </motion.div>

            {/* Status Label - Floating beneath */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-[-10%] flex flex-col items-center"
            >
                <div className="h-[1px] w-12 bg-gradient-to-r from-transparent via-[var(--glass-border)] to-transparent mb-4" />
                <span className="text-[10px] font-black tracking-[0.4em] text-[var(--text-secondary)] opacity-50 uppercase">
                    {config.label}
                </span>
            </motion.div>
        </div>
    )
}


