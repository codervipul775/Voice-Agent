'use client'

import { useEffect, useRef } from 'react'

interface AudioVisualizerProps {
  audioLevel: number
  isActive: boolean
  state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'
}

export default function AudioVisualizer({ audioLevel, isActive, state }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    const centerY = height / 2
    const bars = 50

    const draw = () => {
      // Clear canvas
      ctx.fillStyle = 'rgba(15, 23, 42, 0.3)'
      ctx.fillRect(0, 0, width, height)

      // Draw bars
      const barWidth = width / bars
      
      for (let i = 0; i < bars; i++) {
        const x = i * barWidth
        
        // Random height with audio level influence
        const randomHeight = isActive 
          ? (Math.random() * audioLevel * height * 0.8) + (height * 0.1)
          : height * 0.05

        // Color based on state
        let color
        switch (state) {
          case 'listening':
            color = `rgba(34, 197, 94, ${0.5 + audioLevel * 0.5})`
            break
          case 'speaking':
            color = `rgba(59, 130, 246, ${0.5 + audioLevel * 0.5})`
            break
          case 'thinking':
            color = `rgba(251, 191, 36, 0.6)`
            break
          default:
            color = 'rgba(107, 114, 128, 0.3)'
        }

        ctx.fillStyle = color
        ctx.fillRect(x, centerY - randomHeight / 2, barWidth - 2, randomHeight)
      }

      requestAnimationFrame(draw)
    }

    draw()
  }, [audioLevel, isActive, state])

  return (
    <div className="relative w-full h-32 bg-slate-900/50 rounded-lg overflow-hidden">
      <canvas
        ref={canvasRef}
        width={800}
        height={128}
        className="w-full h-full"
      />
    </div>
  )
}
