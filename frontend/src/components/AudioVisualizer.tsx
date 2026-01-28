'use client'

import { useEffect, useRef, useCallback } from 'react'
import { VoiceState } from '@/store/voiceStore'

interface AudioVisualizerProps {
  audioLevel: number // 0 to 1
  isActive: boolean
  state: VoiceState
}

export default function AudioVisualizer({ audioLevel, isActive, state }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Color configuration
  const getColors = useCallback(() => {
    switch (state) {
      case 'listening': return ['#4ade80', '#22c55e'] // Green
      case 'speaking': return ['#38bdf8', '#0ea5e9'] // Blue
      case 'thinking': return ['#a855f7', '#9333ea'] // Purple
      case 'error': return ['#ef4444', '#dc2626'] // Red
      default: return ['#94a3b8', '#64748b'] // Gray
    }
  }, [state])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number

    // Config
    const bars = 60 // Number of bars
    const barWidth = 4
    const gap = 2
    const center = canvas.width / 2

    // Animation state
    const currentLevels = new Array(bars).fill(0)

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const [color1, color2] = getColors()

      // Dynamic height based on audio level + random jitter for "aliveness"
      // If inactive, show small idle wave

      for (let i = 0; i < bars; i++) {
        // Calculate target height
        let targetHeight = 0

        if (isActive || state === 'speaking') {
          // Distance from center (0 to 1)
          const dist = Math.abs(i - bars / 2) / (bars / 2)

          // Mirror effect: Higher in center, lower at edges
          const curve = Math.cos(dist * Math.PI / 2)

          // Random jitter
          const jitter = Math.random() * 0.3 + 0.7

          targetHeight = audioLevel * 100 * curve * jitter
          targetHeight = Math.max(targetHeight, 2) // Min height
        } else {
          // Idle animation
          const time = Date.now() / 300
          const wave = Math.sin(i * 0.5 + time) * 3
          targetHeight = 4 + wave
        }

        // Smooth transition
        currentLevels[i] += (targetHeight - currentLevels[i]) * 0.2

        const h = currentLevels[i]
        const x = center - (bars * (barWidth + gap)) / 2 + i * (barWidth + gap)
        const y = canvas.height / 2 - h / 2

        // Gradient fill
        const gradient = ctx.createLinearGradient(x, y, x, y + h)
        gradient.addColorStop(0, color1)
        gradient.addColorStop(1, color2)

        ctx.fillStyle = gradient

        // Round caps
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, h, 2)
        ctx.fill()
      }

      animationId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [audioLevel, isActive, state, getColors])

  return (
    <div className="w-full h-24 flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={400}
        height={100}
        className="max-w-full"
      />
    </div>
  )
}
