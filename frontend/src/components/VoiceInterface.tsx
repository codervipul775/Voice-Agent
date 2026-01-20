'use client'

import { useEffect, useState } from 'react'
import { Mic, MicOff, Settings, Zap, Menu, X } from 'lucide-react'
import { useVoiceStore } from '@/store/voiceStore'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { useInterruptDetector } from '@/hooks/useInterruptDetector'
import AgentAvatar from './AgentAvatar'
import LiveCaptions from './LiveCaptions'
import AudioStats from './AudioStats'
import SettingsModal from './SettingsModal'

export default function VoiceInterface() {
  const { state, isConnected, connect, vadStatus, setAudioCallback, sendInterrupt } = useVoiceStore()
  const { isRecording, startRecording, stopRecording, audioLevel, vadMode, toggleVadMode, cleanup } = useAudioRecorder()
  const { queueAudio, stopAudio } = useAudioPlayer()

  // Enable hands-free barge-in detection (monitors mic during AI speech)
  useInterruptDetector({ stopAudio })
  const [sessionId, setSessionId] = useState<string>('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  useEffect(() => {
    setSessionId(crypto.randomUUID())
    return () => cleanup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setAudioCallback((audioDataBase64: string) => {
      try {
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
  }, [])

  const handleToggleConnection = async () => {
    // Handle barge-in interrupt when AI is speaking
    if (state === 'speaking') {
      console.log('🛑 Barge-in interrupt triggered')
      stopAudio()      // Stop audio playback immediately
      sendInterrupt()  // Send interrupt signal to backend
      // Start recording again to capture user's new input
      setTimeout(() => {
        startRecording()
      }, 100)
      return
    }

    if (!isConnected) {
      // First click: Connect WebSocket AND start recording
      await connect(sessionId)
      // Small delay to ensure connection is established
      setTimeout(() => {
        startRecording()
      }, 500)
    } else if (isRecording) {
      // Stop recording
      stopRecording()
    } else {
      // Start new recording
      startRecording()
    }
  }

  const micButtonColor = isRecording
    ? vadStatus?.is_speech
      ? 'bg-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.4)]'
      : 'bg-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.4)]'
    : 'bg-slate-700 hover:bg-cyan-500 shadow-lg'

  return (
    <div className="h-screen w-full flex overflow-hidden relative font-sans text-slate-200">

      {/* LEFT PANEL - THE STAGE (70%) */}
      <div className="flex-1 flex flex-col relative z-10 transition-all duration-300">

        {/* Header */}
        <header className="p-6 flex justify-between items-center z-20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight text-white">Voice<span className="text-cyan-400">OS</span></h1>
              <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-wider text-slate-500">
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                {isConnected ? 'System Online' : 'Offline'}
              </div>
            </div>
          </div>

          {/* Mobile Sidebar Toggle */}
          <button className="md:hidden p-2 text-slate-400 hover:text-white" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            {isSidebarOpen ? <X /> : <Menu />}
          </button>
        </header>

        {/* Main Agent Area */}
        <main className="flex-1 flex flex-col items-center justify-center relative">

          {/* Ambient Background Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/5 blur-[120px] rounded-full pointer-events-none" />

          {/* Avatar */}
          <div className="mb-12">
            <AgentAvatar state={state} audioLevel={audioLevel} />
          </div>

          {/* Status Text */}
          <div className="text-center h-8">
            <span className={`
              inline-block px-4 py-1 rounded-full text-sm font-medium tracking-wide
              backdrop-blur-md border border-white/5
              ${state === 'listening' ? 'text-emerald-400 bg-emerald-500/10' :
                state === 'thinking' ? 'text-indigo-400 bg-indigo-500/10' :
                  state === 'speaking' ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-500'}
            `}>
              {state === 'idle' ? 'Ready to connect' :
                state === 'listening' ? (vadStatus?.is_speech ? 'Listening...' : 'Listening (Silence)') :
                  state.charAt(0).toUpperCase() + state.slice(1)}
            </span>
          </div>

        </main>

        {/* Bottom Control Bar */}
        <div className="p-8 flex justify-center pb-12">
          <div className="glass-panel rounded-full p-2 pl-6 pr-2 flex items-center gap-6 shadow-2xl shadow-black/50">

            {/* Mode Toggle - Always visible */}
            <button
              onClick={toggleVadMode}
              disabled={isRecording}
              className={`text-xs font-bold uppercase tracking-wider transition-colors flex flex-col items-start ${isRecording ? 'opacity-50 cursor-not-allowed' : 'text-slate-400 hover:text-white'}`}
            >
              <span className="text-[10px] opacity-50">Mode</span>
              <span className={vadMode ? "text-cyan-400" : "text-white"}>{vadMode ? 'Auto (VAD)' : 'Push to Talk'}</span>
            </button>

            {/* Divider */}
            <div className="w-px h-8 bg-white/10" />

            {/* Mic Button - Enabled during speaking for barge-in */}
            <button
              onClick={handleToggleConnection}
              disabled={state === 'thinking'}
              className={`
                w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300
                ${state === 'speaking'
                  ? 'bg-orange-500 hover:bg-orange-400 shadow-[0_0_30px_rgba(249,115,22,0.4)] animate-pulse'
                  : micButtonColor}
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
              title={state === 'speaking' ? 'Click to interrupt' : isRecording ? 'Recording...' : 'Click to speak'}
            >
              {isRecording ? <Mic className="w-6 h-6 text-white" /> : <MicOff className="w-6 h-6 text-white/50" />}
            </button>

            {/* Divider */}
            <div className="w-px h-8 bg-white/10" />

            {/* Settings */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>

          </div>
        </div>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* RIGHT PANEL - SIDEBAR (30%) */}
      <aside className={`
        absolute md:relative right-0 top-0 h-full w-full md:w-[350px] lg:w-[400px]
        bg-slate-950/80 backdrop-blur-xl border-l border-white/5
        flex flex-col z-30 transition-transform duration-300
        ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
      `}>
        {/* Audio Stats */}
        <div className="p-4 border-b border-white/5 bg-slate-900/50">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Signal Telemetry</div>
          {isConnected ? <AudioStats /> : <div className="h-20 flex items-center justify-center text-slate-600 text-sm">Offline</div>}
        </div>

        {/* Transcript Feed */}
        <div className="flex-1 flex flex-col min-h-0 bg-transparent relative">
          <div className="p-4 pb-2 text-xs font-bold uppercase tracking-wider text-slate-500 sticky top-0 bg-slate-950/90 z-10 backdrop-blur">
            Live Transcript
          </div>
          <div className="flex-1 overflow-hidden relative">
            <div className="absolute inset-0 p-4 pt-0">
              <LiveCaptions />
            </div>
          </div>
        </div>
      </aside>

    </div>
  )
}
