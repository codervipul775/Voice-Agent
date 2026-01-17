'use client'

import { useEffect, useState } from 'react'
import { Mic, MicOff, Activity } from 'lucide-react'
import { useVoiceStore } from '@/store/voiceStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import StateIndicator from './StateIndicator'
import LiveCaptions from './LiveCaptions'
import AudioVisualizer from './AudioVisualizer'

export default function VoiceInterface() {
  const { state, isConnected, connect, disconnect, setAudioCallback } = useVoiceStore()
  const { isRecording, startRecording, stopRecording, audioLevel } = useAudioRecorder()
  const { isPlaying, queueAudio } = useAudioPlayer()
  const [sessionId, setSessionId] = useState<string>('')

  useEffect(() => {
    // Generate session ID
    setSessionId(crypto.randomUUID())
  }, [])

  // Set up audio playback callback (only once on mount)
  useEffect(() => {
    setAudioCallback((audioDataBase64: string) => {
      try {
        // Decode base64 to ArrayBuffer
        const binaryString = atob(audioDataBase64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        queueAudio(bytes.buffer)
      } catch (error) {
        console.error('Error decoding audio:', error)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  const handleToggleConnection = async () => {
    if (!isConnected) {
      // First time: connect WebSocket
      await connect(sessionId)
    } else if (isRecording) {
      // Stop recording and send audio
      stopRecording()
    } else {
      // Start next recording
      startRecording()
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">
          🎙️ Voice Assistant
        </h1>
        <p className="text-gray-300">
          Production-ready, low-latency AI voice conversations
        </p>
      </div>

      {/* Main Interface */}
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
        {/* State Indicator */}
        <div className="mb-6">
          <StateIndicator state={state} isRecording={isRecording} />
        </div>

        {/* Audio Visualizer */}
        <div className="mb-6">
          <AudioVisualizer 
            audioLevel={audioLevel} 
            isActive={isRecording}
            state={state}
          />
        </div>

        {/* Control Button */}
        <div className="flex justify-center mb-6">
          <button
            onClick={handleToggleConnection}
            className={`
              relative group
              w-32 h-32 rounded-full
              flex items-center justify-center
              transition-all duration-300 transform
              ${isRecording 
                ? 'bg-red-500 hover:bg-red-600 hover:scale-110' 
                : state === 'speaking' || state === 'thinking'
                ? 'bg-gray-500 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 hover:scale-110'
              }
              shadow-lg hover:shadow-2xl
              ${isRecording ? 'animate-pulse' : ''}
            `}
            disabled={state === 'speaking' || state === 'thinking'}
          >
            {isRecording ? (
              <Mic className="w-12 h-12 text-white" />
            ) : (
              <MicOff className="w-12 h-12 text-white" />
            )}
            
            {/* Ripple effect when active */}
            {isRecording && (
              <span className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-75"></span>
            )}
          </button>
        </div>

        <div className="text-center mb-6">
          <p className="text-white text-sm">
            {!isConnected ? 'Click microphone to start' : 
             isRecording ? 'Click to stop and send' : 
             state === 'speaking' ? 'AI is speaking...' :
             state === 'thinking' ? 'Processing...' :
             'Click to ask another question'}
          </p>
        </div>

        {/* Connection Status */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
          <span className="text-sm text-gray-300">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Live Captions */}
        {isConnected && (
          <LiveCaptions />
        )}

        {/* Stats (Optional) */}
        <div className="mt-6 grid grid-cols-3 gap-4 text-center">
          <div className="bg-white/5 rounded-lg p-3">
            <div className="text-2xl font-bold text-white">
              {state === 'listening' ? '🎤' : state === 'thinking' ? '🤔' : state === 'speaking' ? '🔊' : '💤'}
            </div>
            <div className="text-xs text-gray-400 mt-1">Status</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <div className="text-2xl font-bold text-white">
              {Math.round(audioLevel * 100)}%
            </div>
            <div className="text-xs text-gray-400 mt-1">Audio Level</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <div className="text-2xl font-bold text-white">
              {sessionId.split('-')[0]}
            </div>
            <div className="text-xs text-gray-400 mt-1">Session</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center mt-8 text-gray-400 text-sm">
        <p>Powered by Deepgram, Groq, and Cartesia</p>
      </div>
    </div>
  )
}
