import { useEffect, useRef, useState } from 'react'
import { useVoiceStore } from '@/store/voiceStore'

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const { sendAudio } = useVoiceStore()

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop()
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close()
      }
    }
  }, [isRecording])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      })

      // Set up audio level monitoring
      audioContextRef.current = new AudioContext()
      await audioContextRef.current.resume() // Ensure context is running
      const source = audioContextRef.current.createMediaStreamSource(stream)
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 2048
      analyserRef.current.smoothingTimeConstant = 0.8
      source.connect(analyserRef.current)

      const bufferLength = analyserRef.current.fftSize
      const dataArray = new Uint8Array(bufferLength)

      // Set up MediaRecorder for continuous recording
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      })

      const chunks: Blob[] = []
      let silenceStart: number | null = null
      let isSpeaking = false
      let autoStopped = false // Track if VAD triggered the stop
      let manualStop = false // Track manual stop
      const SILENCE_THRESHOLD = 3 // Even lower threshold
      const SILENCE_DURATION = 1200 // 1.2 seconds
      
      mediaRecorder.start(100)
      console.log('🎙️ Recording started - SPEAK NOW!')

      // Combined audio monitoring and VAD
      const monitorAudio = () => {
        if (!analyserRef.current || !isRecording || manualStop) return

        analyserRef.current.getByteTimeDomainData(dataArray)
        
        // Calculate RMS (root mean square) for better amplitude detection
        let sum = 0
        for (let i = 0; i < bufferLength; i++) {
          const normalized = (dataArray[i] - 128) / 128
          sum += normalized * normalized
        }
        const rms = Math.sqrt(sum / bufferLength)
        setAudioLevel(rms)

        // Also get max volume for detection
        let max = 0
        for (let i = 0; i < bufferLength; i++) {
          const value = Math.abs(dataArray[i] - 128)
          if (value > max) max = value
        }

        // Only log occasionally to avoid spam
        if (Math.random() < 0.05) {
          console.log('🔊 Level:', max, 'RMS:', rms.toFixed(3))
        }

        const currentTime = Date.now()

        // Detect speech using max volume
        if (max > SILENCE_THRESHOLD) {
          if (!isSpeaking) {
            console.log('🎤 SPEECH DETECTED! Max:', max, 'Threshold:', SILENCE_THRESHOLD)
            isSpeaking = true
          }
          silenceStart = null
        } 
        // Detect silence after speech
        else if (isSpeaking) {
          if (!silenceStart) {
            silenceStart = currentTime
            console.log('🤫 Silence detected, waiting', SILENCE_DURATION, 'ms...')
          } else if (currentTime - silenceStart > SILENCE_DURATION) {
            const elapsed = currentTime - silenceStart
            console.log('✅ Silence confirmed after', elapsed, 'ms - Sending', chunks.length, 'chunks')
            if (mediaRecorder.state === 'recording') {
              autoStopped = true // Mark as auto-stopped by VAD
              mediaRecorder.stop()
            }
            isSpeaking = false
            silenceStart = null
            return
          }
        }

        requestAnimationFrame(monitorAudio)
      }
      
      monitorAudio()

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const wasAutoStopped = autoStopped
        autoStopped = false // Reset flag
        
        if (chunks.length > 0) {
          const completeBlob = new Blob(chunks, { type: 'audio/webm;codecs=opus' })
          console.log('📤 Sending speech blob, size:', completeBlob.size)
          
          // Send IMMEDIATELY - no timeout
          sendAudio(completeBlob)
          chunks.length = 0
        }
        
        // ONLY restart if VAD triggered the stop (not manual user action)
        if (wasAutoStopped && isRecording) {
          setTimeout(() => {
            if (mediaRecorder.state === 'inactive' && isRecording) {
              console.log('🔄 VAD auto-restart...')
              mediaRecorder.start(100)
              isSpeaking = false
              silenceStart = null
              monitorAudio()
            }
          }, 200)
        } else {
          console.log('🛑 Manual stop - not restarting')
        }
      }

      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)

    } catch (error) {
      console.error('Error starting recording:', error)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      console.log('🛑 User MANUALLY stopping recording')
      setIsRecording(false) // Set state first to stop monitoring loop
      
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      
      // Clean up refs
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close()
      }
      analyserRef.current = null
      audioContextRef.current = null
      mediaRecorderRef.current = null
      
      setAudioLevel(0)
      console.log('✅ Recording fully stopped')
    }
  }

  return {
    isRecording,
    audioLevel,
    startRecording,
    stopRecording
  }
}
