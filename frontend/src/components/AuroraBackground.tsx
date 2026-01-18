'use client'

import { useEffect, useRef } from 'react'

export default function AuroraBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        let animationFrameId: number
        let t = 0

        const resize = () => {
            canvas.width = window.innerWidth
            canvas.height = window.innerHeight
        }

        const draw = () => {
            if (!canvas || !ctx) return

            // Clear canvas with a very slight fade effect for trails
            // ctx.fillStyle = 'rgba(10, 10, 20, 0.05)' // Don't clear fully to leave trails? No, cleaner looks better.
            ctx.clearRect(0, 0, canvas.width, canvas.height)

            // Background base
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
            gradient.addColorStop(0, '#0f172a') // Slate 900
            gradient.addColorStop(1, '#020617') // Slate 950
            ctx.fillStyle = gradient
            ctx.fillRect(0, 0, canvas.width, canvas.height)

            // Draw aurora blobs
            t += 0.005

            const blobs = [
                { x: canvas.width * 0.2, y: canvas.height * 0.3, r: 400, color: 'rgba(6, 182, 212, 0.25)' }, // Cyan 500
                { x: canvas.width * 0.8, y: canvas.height * 0.7, r: 500, color: 'rgba(37, 99, 235, 0.2)' }, // Blue 600
                { x: canvas.width * 0.5, y: canvas.height * 0.5, r: 350, color: 'rgba(16, 185, 129, 0.2)' }, // Emerald 500
            ]

            blobs.forEach((blob, i) => {
                const x = blob.x + Math.sin(t + i) * 100
                const y = blob.y + Math.cos(t * 0.5 + i) * 50

                const g = ctx.createRadialGradient(x, y, 0, x, y, blob.r)
                g.addColorStop(0, blob.color)
                g.addColorStop(1, 'rgba(0,0,0,0)')

                ctx.fillStyle = g
                ctx.beginPath()
                ctx.arc(x, y, blob.r, 0, Math.PI * 2)
                ctx.fill()
            })

            animationFrameId = requestAnimationFrame(draw)
        }

        window.addEventListener('resize', resize)
        resize()
        draw()

        return () => {
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(animationFrameId)
        }
    }, [])

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 w-full h-full -z-10 pointer-events-none"
        />
    )
}
