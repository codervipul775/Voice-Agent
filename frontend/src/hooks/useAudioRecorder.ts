import { useEffect, useRef, useState, useCallback } from 'react'
import { useVoiceStore } from '@/store/voiceStore'

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [vadMode, setVadMode] = useState(true)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const isRecordingRef = useRef(false)
  const { sendAudio } = useVoiceStore()

  // Audio level monitoring
  useEffect(() => {
    if (!analyserRef.current || !isRecording) {
      setAudioLevel(0)
      return
    }

    const bufferLength = analyserRef.current.fftSize
    const dataArray = new Uint8Array(bufferLength)

    const updateAudioLevel = () => {
      if (!analyserRef.current || !isRecordingRef.current) {
        return
      }

      analyserRef.current.getByteTimeDomainData(dataArray)

      let sum = 0
      for (let i = 0; i < bufferLength; i++) {
        const normalized = (dataArray[i] - 128) / 128
        sum += normalized * normalized
      }
      const rms = Math.sqrt(sum / bufferLength)

      setAudioLevel(rms)
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel)
    }

    updateAudioLevel()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isRecording])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [])

  // Create a complete WebM recording and send it
  const recordAndSendChunk = useCallback(async (stream: MediaStream, durationMs: number): Promise<void> => {
    return new Promise((resolve) => {
      const chunks: Blob[] = []

      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 32000
      })

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data)
        }
      }

      recorder.onstop = () => {
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: 'audio/webm' })
          console.log(`📤 Sending chunk: ${blob.size} bytes`)
          sendAudio(blob)
        }
        resolve()
      }

      recorder.start()

      // Stop after duration
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop()
        }
      }, durationMs)
    })
  }, [sendAudio])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1,
        }
      })

      mediaStreamRef.current = stream
      isRecordingRef.current = true

      // Set up audio level monitoring
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext({ sampleRate: 16000 })
      }
      await audioContextRef.current.resume()

      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect()
      }

      const source = audioContextRef.current.createMediaStreamSource(stream)
      sourceNodeRef.current = source

      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 2048
      analyserRef.current.smoothingTimeConstant = 0.8
      source.connect(analyserRef.current)

      console.log('🎤 Microphone activated')
      setIsRecording(true)

      if (vadMode) {
        // VAD MODE: Send SMALLER chunks (1.5s) continuously
        // Backend will accumulate and detect when user stops speaking
        console.log('🎙️ VAD mode: Streaming 1.5-second chunks for silence detection')

        const recordLoop = async () => {
          while (isRecordingRef.current && mediaStreamRef.current) {
            await recordAndSendChunk(mediaStreamRef.current, 1500) // 1.5 second chunks

            // Small gap between recordings
            await new Promise(r => setTimeout(r, 50))
          }
        }

        recordLoop()

      } else {
        // PUSH-TO-TALK MODE: Single continuous recording
        const chunks: Blob[] = []

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 32000
        })

        mediaRecorderRef.current = mediaRecorder

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data)
            console.log('📦 Collected chunk:', event.data.size, 'bytes')
          }
        }

        mediaRecorder.onstop = async () => {
          console.log('🎤 Recording stopped, chunks:', chunks.length)

          if (chunks.length > 0) {
            const audioBlob = new Blob(chunks, { type: 'audio/webm' })
            console.log('📤 Sending audio:', audioBlob.size, 'bytes')
            sendAudio(audioBlob)
          }

          setIsRecording(false)
          isRecordingRef.current = false
          cleanup()
        }

        // Record continuously
        mediaRecorder.start(100)
        console.log('🎙️ Push-to-talk: Recording')
      }

    } catch (error) {
      console.error('Error starting recording:', error)
      setIsRecording(false)
      isRecordingRef.current = false
    }
  }

  const stopRecording = () => {
    console.log('🛑 Stopping recording')
    isRecordingRef.current = false

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }

    if (vadMode) {
      setIsRecording(false)
      cleanup()
    }
  }

  const cleanup = () => {
    isRecordingRef.current = false

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect()
      sourceNodeRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }
    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close()
    }
    analyserRef.current = null
    audioContextRef.current = null
    mediaRecorderRef.current = null
    setAudioLevel(0)
    console.log('🔇 Microphone deactivated')
  }

  const toggleVadMode = () => {
    if (isRecording) {
      console.log('⚠️ Cannot toggle while recording')
      return
    }
    setVadMode(!vadMode)
    console.log('🔄 Mode:', !vadMode ? 'VAD' : 'Push-to-Talk')
  }

  return {
    isRecording,
    audioLevel,
    vadMode,
    startRecording,
    stopRecording,
    toggleVadMode,
    cleanup
  }
}
