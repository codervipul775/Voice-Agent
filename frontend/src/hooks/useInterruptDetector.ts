import { useEffect, useRef, useCallback } from 'react'
import { useVoiceStore } from '@/store/voiceStore'

// Much lower threshold to detect speech over AI audio
const SPEECH_THRESHOLD = 0.15
// Need more frames to avoid false triggers from music/AI voice
const FRAMES_REQUIRED = 5
// Baseline calibration time in ms
const CALIBRATION_TIME = 500

interface UseInterruptDetectorProps {
    stopAudio: () => void
}


export function useInterruptDetector({ stopAudio }: UseInterruptDetectorProps) {
    const { state, sendInterrupt } = useVoiceStore()

    const streamRef = useRef<MediaStream | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)
    const animationFrameRef = useRef<number | null>(null)
    const consecutiveFramesRef = useRef(0)
    const isMonitoringRef = useRef(false)
    const baselineRef = useRef(0)
    const samplesRef = useRef<number[]>([])

    // Stop monitoring
    const stopMonitoring = useCallback(() => {
        if (!isMonitoringRef.current) return


        isMonitoringRef.current = false
        consecutiveFramesRef.current = 0
        baselineRef.current = 0
        samplesRef.current = []

        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
            animationFrameRef.current = null
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop())
            streamRef.current = null
        }

        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close()
            audioContextRef.current = null
        }

        analyserRef.current = null
    }, [])

    // Start monitoring mic for speech during AI playback
    const startMonitoring = useCallback(async () => {
        if (isMonitoringRef.current) return

        try {


            // Get mic access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            })

            streamRef.current = stream

            // Set up audio analysis
            audioContextRef.current = new AudioContext()
            const source = audioContextRef.current.createMediaStreamSource(stream)
            analyserRef.current = audioContextRef.current.createAnalyser()
            analyserRef.current.fftSize = 256  // Faster updates
            analyserRef.current.smoothingTimeConstant = 0.5
            source.connect(analyserRef.current)

            isMonitoringRef.current = true
            consecutiveFramesRef.current = 0
            samplesRef.current = []

            const startTime = Date.now()

            // Monitor loop
            const checkSpeech = () => {
                if (!isMonitoringRef.current || !analyserRef.current) return

                const bufferLength = analyserRef.current.fftSize
                const dataArray = new Uint8Array(bufferLength)
                analyserRef.current.getByteTimeDomainData(dataArray)

                // Calculate RMS
                let sum = 0
                for (let i = 0; i < bufferLength; i++) {
                    const normalized = (dataArray[i] - 128) / 128
                    sum += normalized * normalized
                }
                const rms = Math.sqrt(sum / bufferLength)

                const elapsed = Date.now() - startTime

                // Calibration phase: collect baseline samples
                if (elapsed < CALIBRATION_TIME) {
                    samplesRef.current.push(rms)
                    animationFrameRef.current = requestAnimationFrame(checkSpeech)
                    return
                }

                // Calculate baseline once after calibration
                if (baselineRef.current === 0 && samplesRef.current.length > 0) {
                    baselineRef.current = samplesRef.current.reduce((a, b) => a + b, 0) / samplesRef.current.length

                }

                // Use adaptive threshold: must be significantly above baseline
                const adaptiveThreshold = Math.max(SPEECH_THRESHOLD, baselineRef.current * 2.5)

                // Check if above threshold
                if (rms > adaptiveThreshold) {
                    consecutiveFramesRef.current++


                    if (consecutiveFramesRef.current >= FRAMES_REQUIRED) {

                        stopMonitoring()
                        stopAudio()
                        sendInterrupt()
                        return
                    }
                } else {
                    if (consecutiveFramesRef.current > 0) {
                        consecutiveFramesRef.current = Math.max(0, consecutiveFramesRef.current - 1)
                    }
                }

                animationFrameRef.current = requestAnimationFrame(checkSpeech)
            }

            checkSpeech()

        } catch (error) {
            console.error('Failed to start interrupt detection:', error)
        }
    }, [sendInterrupt, stopAudio, stopMonitoring])

    // Auto-start/stop monitoring based on state
    useEffect(() => {
        if (state === 'speaking') {
            startMonitoring()
        } else {
            stopMonitoring()
        }

        return () => {
            stopMonitoring()
        }
    }, [state, startMonitoring, stopMonitoring])

    return {
        isMonitoring: isMonitoringRef.current
    }
}
