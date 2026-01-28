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
  const cleanup = useCallback(() => {
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
  }, [])

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

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
          sendAudio(blob)
        }
        resolve()
      }

      recorder.start()

      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop()
        }
      }, durationMs)
    })
  }, [sendAudio])

  const startRecording = useCallback(async () => {
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


      setIsRecording(true)

      if (vadMode) {
        // VAD MODE: Send chunks continuously (1.5s each)


        const recordLoop = async () => {
          while (isRecordingRef.current && mediaStreamRef.current) {
            await recordAndSendChunk(mediaStreamRef.current, 1500)
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

          }
        }

        mediaRecorder.onstop = async () => {


          if (chunks.length > 0) {
            const audioBlob = new Blob(chunks, { type: 'audio/webm' })

            sendAudio(audioBlob)
          }

          setIsRecording(false)
          isRecordingRef.current = false
          cleanup()
        }

        mediaRecorder.start(100)

      }

    } catch (error) {
      console.error('Error starting recording:', error)
      setIsRecording(false)
      isRecordingRef.current = false
    }
  }, [vadMode, recordAndSendChunk, sendAudio, cleanup])

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }

    if (vadMode) {
      setIsRecording(false)
      cleanup()
    }
  }, [vadMode, cleanup])

  const toggleVadMode = useCallback(() => {
    if (isRecording) {
      return
    }
    setVadMode((prev) => !prev)
  }, [isRecording])

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
