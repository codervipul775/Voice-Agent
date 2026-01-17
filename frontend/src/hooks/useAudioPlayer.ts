import { useState, useRef, useEffect } from 'react'

export function useAudioPlayer() {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioQueueRef = useRef<ArrayBuffer[]>([])
  const isProcessingRef = useRef(false)

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
      console.log('⏸️ Already processing queue, skipping')
      return
    }

    if (audioQueueRef.current.length === 0) {
      console.log('📭 Queue is empty')
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
      const audioDataCopy = audioData.slice(0)
      
      console.log('🎵 Decoding audio chunk:', audioDataCopy.byteLength, 'bytes')
      const audioBuffer = await audioContextRef.current.decodeAudioData(audioDataCopy)
      console.log('✅ Decoded, duration:', audioBuffer.duration.toFixed(2), 's')
      
      const source = audioContextRef.current.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContextRef.current.destination)
      
      // Wait for playback to finish before processing next item
      await new Promise<void>((resolve) => {
        source.onended = () => {
          console.log('✅ Audio chunk finished')
          resolve()
        }
        source.start()
        console.log('▶️ Playing audio chunk')
      })

    } catch (error) {
      console.error('❌ Error playing audio:', error)
    }

    // Mark processing as done
    isProcessingRef.current = false

    // Process next item in queue if available
    if (audioQueueRef.current.length > 0) {
      console.log('📋 Queue has', audioQueueRef.current.length, 'more chunks')
      setTimeout(() => processQueue(), 50)
    } else {
      console.log('🎉 Queue completed')
      setIsPlaying(false)
    }
  }

  const queueAudio = (audioData: ArrayBuffer) => {
    console.log('➕ Adding to queue, current length:', audioQueueRef.current.length)
    audioQueueRef.current.push(audioData)
    
    // Start processing if not already doing so
    if (!isProcessingRef.current) {
      processQueue()
    }
  }

  const stopAudio = () => {
    console.log('🛑 Stopping audio and clearing queue')
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
