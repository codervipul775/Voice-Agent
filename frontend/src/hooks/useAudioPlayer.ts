import { useState, useRef, useEffect } from 'react'

export function useAudioPlayer() {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioQueueRef = useRef<ArrayBuffer[]>([])
  const isProcessingRef = useRef(false)
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const stoppedRef = useRef(false)

  useEffect(() => {
    // Initialize audio context
    audioContextRef.current = new AudioContext()

    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close()
      }
    }
  }, [])

  const processQueue = async () => {
    // Prevent concurrent processing
    if (isProcessingRef.current) {
      return
    }

    if (audioQueueRef.current.length === 0 || stoppedRef.current) {
      setIsPlaying(false)
      return
    }

    isProcessingRef.current = true
    setIsPlaying(true)

    const audioData = audioQueueRef.current.shift()
    if (!audioData) {
      isProcessingRef.current = false
      return
    }

    if (!audioContextRef.current) {
      console.error('AudioContext not initialized')
      isProcessingRef.current = false
      return
    }

    try {
      // Resume context if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }

      const audioDataCopy = audioData.slice(0)
      const audioBuffer = await audioContextRef.current.decodeAudioData(audioDataCopy)

      // Check if stopped during decode
      if (stoppedRef.current) {
        isProcessingRef.current = false
        return
      }

      const source = audioContextRef.current.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContextRef.current.destination)

      // Store reference for interrupt
      currentSourceRef.current = source

      // Wait for playback to finish before processing next item
      await new Promise<void>((resolve) => {
        source.onended = () => {
          currentSourceRef.current = null
          resolve()
        }
        source.start()
      })

    } catch (error) {
      console.error('❌ Error playing audio:', error)
    }

    // Mark processing as done
    isProcessingRef.current = false

    // Process next item in queue if available and not stopped
    if (audioQueueRef.current.length > 0 && !stoppedRef.current) {
      setTimeout(() => processQueue(), 10)
    } else {
      setIsPlaying(false)
    }
  }

  const queueAudio = (audioData: ArrayBuffer) => {
    // Reset stopped flag when new audio comes in
    stoppedRef.current = false
    audioQueueRef.current.push(audioData)

    // Start processing if not already doing so
    if (!isProcessingRef.current) {
      processQueue()
    }
  }

  const stopAudio = () => {
    console.log('🛑 Stopping audio playback immediately')

    // Set stopped flag
    stoppedRef.current = true

    // Stop current playing audio
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop()
        currentSourceRef.current.disconnect()
      } catch {
        // Ignore errors if already stopped
      }
      currentSourceRef.current = null
    }

    // Clear queue
    audioQueueRef.current = []
    isProcessingRef.current = false
    setIsPlaying(false)
  }

  return {
    isPlaying,
    queueAudio,
    stopAudio
  }
}
