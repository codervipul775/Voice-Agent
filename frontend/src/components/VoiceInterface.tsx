'use client'

import { useEffect, useState } from 'react'
import { Mic, MicOff, Settings, Zap, Menu, X, Activity, LayoutDashboard } from 'lucide-react'
import { useVoiceStore } from '@/store/voiceStore'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { useInterruptDetector } from '@/hooks/useInterruptDetector'
import AgentAvatar from './AgentAvatar'
import LiveCaptions from './LiveCaptions'
import AudioStats from './AudioStats'
import SettingsModal from './SettingsModal'
import MetricsDashboard from './MetricsDashboard'

export default function VoiceInterface() {
  const { state, isConnected, connect, vadStatus, setAudioCallback, sendInterrupt } = useVoiceStore()
  const { isRecording, startRecording, stopRecording, audioLevel, vadMode, toggleVadMode, cleanup } = useAudioRecorder()
  const { queueAudio, stopAudio } = useAudioPlayer()

  // Enable hands-free barge-in detection (monitors mic during AI speech)
  useInterruptDetector({ stopAudio })

  const [sessionId, setSessionId] = useState<string>('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isMetricsOpen, setIsMetricsOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  useEffect(() => {
    setSessionId(crypto.randomUUID())
    return () => cleanup()
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
  }, [])

  const handleToggleConnection = async () => {
    if (state === 'speaking') {
      stopAudio()
      sendInterrupt()
      setTimeout(() => startRecording(), 100)
      return
    }

    if (!isConnected) {
      await connect(sessionId)
      setTimeout(() => startRecording(), 500)
    } else if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const micButtonVariant = isRecording
    ? vadStatus?.is_speech
      ? 'bg-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.3)]'
      : 'bg-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.3)]'
    : 'bg-white/10 hover:bg-white/20'

  return (
    <div className="h-screen w-full flex bg-[#05050a] overflow-hidden relative font-sans text-slate-200">

      {/* Background Ambience */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full" />
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col relative z-10 transition-all duration-500 ease-in-out">

        {/* Top Navbar */}
        <header className="p-6 flex justify-between items-center bg-gradient-to-b from-black/20 to-transparent">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center neon-glow">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-xl tracking-tight text-white">
                Voice<span className="text-cyan-400">OS</span>
              </h1>
              <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-[0.2em] text-slate-500">
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse-ring' : 'bg-slate-700'}`} />
                {isConnected ? 'Core Active' : 'Offline'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMetricsOpen(!isMetricsOpen)}
              className={`p-2.5 rounded-xl transition-all ${isMetricsOpen ? 'bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/50' : 'text-slate-400 hover:bg-white/5'}`}
              title="Telemetry Dashboard"
            >
              <Activity className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`p-2.5 rounded-xl transition-all ${isSidebarOpen ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5'}`}
              title="Toggle Transcript"
            >
              <LayoutDashboard className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Central Stage */}
        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="relative group">
            {(state === 'listening' || state === 'speaking') && (
              <>
                <div className="absolute inset-[-40px] border border-cyan-500/20 rounded-full animate-[ping_3s_linear_infinite]" />
                <div className="absolute inset-[-80px] border border-purple-500/10 rounded-full animate-[ping_4s_linear_infinite]" />
              </>
            )}
            <AgentAvatar state={state} audioLevel={audioLevel} />
          </div>

          <div className="mt-12 text-center">
            <div className={`
              px-6 py-2 rounded-2xl border border-white/5 backdrop-blur-xl shadow-2xl transition-all duration-300
              ${state === 'listening' ? 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10' :
                state === 'thinking' ? 'text-indigo-400 bg-indigo-500/5 border-indigo-500/10' :
                  state === 'speaking' ? 'text-cyan-400 bg-cyan-500/5 border-cyan-500/10' : 'text-slate-500 bg-white/5'}
            `}>
              <span className="text-xs font-bold uppercase tracking-[0.3em]">
                {state === 'idle' ? 'System Ready' :
                  state === 'listening' ? (vadStatus?.is_speech ? 'Receiving Speech' : 'Await Signal') :
                    state === 'thinking' ? 'Processing...' : 'Emitting Signal'}
              </span>
            </div>
          </div>
        </main>

        {/* Futuristic Control Dock */}
        <div className="p-10 flex justify-center">
          <div className="glass-hud rounded-3xl p-2 flex items-center gap-2 shadow-2xl border border-white/10">
            <div className="px-5 py-2 flex flex-col border-r border-white/5">
              <span className="text-[9px] uppercase font-bold tracking-widest text-slate-500 mb-0.5">Mode</span>
              <button
                onClick={toggleVadMode}
                disabled={isRecording}
                className={`text-[11px] font-bold tracking-wide transition-all ${vadMode ? 'text-cyan-400' : 'text-white'} disabled:opacity-50`}
              >
                {vadMode ? 'VAD AUTO' : 'PUSH TALK'}
              </button>
            </div>

            <button
              onClick={handleToggleConnection}
              disabled={state === 'thinking'}
              className={`
                w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 border border-white/5
                ${state === 'speaking' ? 'bg-orange-500 text-white neon-glow animate-pulse' : micButtonVariant}
                disabled:opacity-30
              `}
            >
              {isRecording ? <Mic className="w-6 h-6 animate-pulse" /> : <MicOff className="w-6 h-6 opacity-40" />}
            </button>

            <div className="flex gap-1 pl-1">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="w-11 h-11 rounded-xl hover:bg-white/5 flex items-center justify-center text-slate-500 hover:text-white transition-all"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SIDEBARS CONTAINER */}
      <div className={`
        fixed md:relative top-0 right-0 h-full flex transition-all duration-500 ease-in-out z-40
        ${(isSidebarOpen || isMetricsOpen) ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
      `}>

        {/* TRANSCRIPT SIDEBAR */}
        <aside className={`
          h-full bg-[#080810]/80 backdrop-blur-2xl border-l border-white/5
          flex flex-col transition-all duration-500
          ${isSidebarOpen
            ? 'w-[350px] lg:w-[380px] opacity-100'
            : 'w-0 opacity-0 overflow-hidden border-none'}
        `}>
          <div className="p-5 border-b border-white/5 bg-white/[0.02] min-w-[350px]">
            <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 mb-4 px-1">Signal Telemetry</div>
            {isConnected ? <AudioStats /> : <div className="h-24 flex items-center justify-center text-slate-700 text-xs uppercase tracking-widest">Awaiting Link...</div>}
          </div>

          <div className="flex-1 flex flex-col min-h-0 relative min-w-[350px]">
            <div className="p-5 pb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 sticky top-0 bg-[#080810]/95 z-10">
              Live Link Transcript
            </div>
            <div className="flex-1 overflow-hidden relative">
              <div className="absolute inset-0 p-5 pt-0 custom-scrollbar overflow-y-auto">
                <LiveCaptions />
              </div>
            </div>
          </div>
        </aside>

        {/* METRICS HUD Panel */}
        <MetricsDashboard isOpen={isMetricsOpen} onClose={() => setIsMetricsOpen(false)} />
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  )
}
