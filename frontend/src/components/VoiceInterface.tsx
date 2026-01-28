'use client'

import { useEffect, useState } from 'react'
import { Mic, MicOff, Settings, Activity, LayoutDashboard, Radio, Cpu } from 'lucide-react'
import { useVoiceStore } from '@/store/voiceStore'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { useInterruptDetector } from '@/hooks/useInterruptDetector'
import AgentAvatar from './AgentAvatar'
import LiveCaptions from './LiveCaptions'
import AudioStats from './AudioStats'
import SettingsModal from './SettingsModal'
import MetricsDashboard from './MetricsDashboard'
import { motion, AnimatePresence } from 'framer-motion'

export default function VoiceInterface() {
  const { state, isConnected, connect, setAudioCallback, sendInterrupt } = useVoiceStore()
  const { isRecording, startRecording, stopRecording, audioLevel, vadMode, toggleVadMode, cleanup } = useAudioRecorder()
  const { queueAudio, stopAudio } = useAudioPlayer()

  useInterruptDetector({ stopAudio })

  const [sessionId, setSessionId] = useState<string>('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isMetricsOpen, setIsMetricsOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  useEffect(() => {
    setSessionId(crypto.randomUUID())
  }, [])

  useEffect(() => {
    return () => cleanup()
  }, [cleanup])

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
  }, [queueAudio, setAudioCallback])

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

  return (
    <div className="h-screen w-full flex bg-[#02040a] overflow-hidden relative font-sans text-slate-200">

      {/* Visual Identity Layer */}
      <div className="mesh-gradient opacity-40" />
      <div className="noise" />

      {/* Background Ambience */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            x: [0, 100, 0],
            y: [0, 50, 0],
            opacity: [0.1, 0.2, 0.1]
          }}
          transition={{ duration: 10, repeat: Infinity }}
          className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-cyan-500/10 blur-[120px] rounded-full"
        />
        <motion.div
          animate={{
            x: [0, -100, 0],
            y: [0, -50, 0],
            opacity: [0.1, 0.2, 0.1]
          }}
          transition={{ duration: 15, repeat: Infinity }}
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-cyan-500/5 blur-[120px] rounded-full"
        />
      </div>

      {/* MAIN CONTENT AREA */}
      <motion.div
        layout
        className="flex-1 flex flex-col relative z-10"
      >

        {/* Top Navbar */}
        <header className="p-8 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full animate-pulse" />
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center relative z-10 shadow-2xl">
                <Cpu className="w-6 h-6 text-white" />
              </div>
            </div>
            <div>
              <h1 className="font-heading font-black text-2xl tracking-tighter text-white">
                VOICE<span className="text-cyan-400">NEURAL</span>
              </h1>
              <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.3em] text-white/20 uppercase">
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-cyan-400' : 'bg-white/10'}`} />
                {isConnected ? 'Neural Link Active' : 'Link Offline'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-white/5 p-1 rounded-2xl glass-panel">
              <button
                onClick={() => setIsMetricsOpen(!isMetricsOpen)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all ${isMetricsOpen ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'text-white/40 hover:text-white'}`}
              >
                <Activity className="w-3.5 h-3.5" />
                TELEMETRY
              </button>
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all ${isSidebarOpen ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                INTERFACE
              </button>
            </div>
          </div>
        </header>

        {/* Central Stage */}
        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <AgentAvatar state={state} audioLevel={audioLevel} />

          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            className="mt-16 flex flex-col items-center gap-4"
          >
            <div className="flex items-center gap-3 px-6 py-2.5 rounded-full glass-panel border-white/5">
              <Radio className={`w-3.5 h-3.5 ${state !== 'idle' ? 'text-cyan-400 animate-pulse' : 'text-white/20'}`} />
              <span className="text-[10px] font-black tracking-[0.4em] text-white/60 uppercase">
                {state === 'idle' ? 'Awaiting Interaction' :
                  state === 'listening' ? 'Analyzing Signal' :
                    state === 'thinking' ? 'Synthesizing' :
                      state === 'speaking' ? 'Emitting Response' : state}
              </span>
            </div>
          </motion.div>
        </main>

        {/* Futuristic Control Dock */}
        <div className="p-12 flex justify-center">
          <div className="relative group">
            <div className="absolute inset-0 bg-cyan-500/5 blur-3xl rounded-full" />
            <div className="glass-panel rounded-[2.5rem] p-3 flex items-center gap-4 relative z-10 border-white/5 pr-6">
              <div className="flex flex-col items-start px-6 border-r border-white/5">
                <span className="text-[8px] font-black tracking-[0.3em] text-white/20 uppercase mb-1">Link Protocol</span>
                <button
                  onClick={toggleVadMode}
                  disabled={isRecording}
                  className={`text-xs font-black tracking-widest transition-all ${vadMode ? 'text-cyan-400' : 'text-white/60'} disabled:opacity-50`}
                >
                  {vadMode ? 'VAD ENABLED' : 'PTT PROTOCOL'}
                </button>
              </div>

              <button
                onClick={handleToggleConnection}
                disabled={state === 'thinking'}
                className={`
                            relative w-20 h-20 rounded-[2rem] flex items-center justify-center transition-all duration-500 group
                            ${isRecording ? 'bg-cyan-500 shadow-2xl shadow-cyan-500/40' : 'bg-white/5 hover:bg-white/10'}
                            disabled:opacity-30
                        `}
              >
                {isRecording ? (
                  <div className="relative">
                    <Mic className="w-8 h-8 text-black relative z-10" />
                    <motion.div
                      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute inset-0 bg-white rounded-full z-0"
                    />
                  </div>
                ) : (
                  <MicOff className="w-8 h-8 text-white/20 group-hover:text-white/40 transition-colors" />
                )}
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="w-12 h-12 rounded-2xl hover:bg-white/5 flex items-center justify-center text-white/20 hover:text-white transition-all"
                >
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* SIDEBARS CONTAINER */}
      <div className="flex shrink-0">
        <AnimatePresence mode="popLayout">
          {isSidebarOpen && (
            <motion.aside
              key="transcript"
              layout
              initial={{ x: 400, opacity: 0, scale: 0.95 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: 400, opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="w-[400px] h-[calc(100vh-4rem)] m-8 ml-0 glass-panel rounded-[2.5rem] flex flex-col overflow-hidden relative z-20"
            >
              <div className="p-8 border-b border-white/5 flex flex-col gap-6">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20 mb-4">Signal Integrity</div>
                  {isConnected ? <AudioStats /> : <div className="h-24 flex items-center justify-center text-white/5 text-[10px] font-black uppercase tracking-[0.5em]">No Data Link</div>}
                </div>
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                <div className="px-8 pt-8 pb-4 text-[10px] font-black uppercase tracking-[0.4em] text-white/20">
                  Signal Log
                </div>
                <div className="flex-1 overflow-hidden p-8 pt-0">
                  <LiveCaptions />
                </div>
              </div>

              {/* Visual Accent */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 blur-3xl pointer-events-none" />
            </motion.aside>
          )}
          <MetricsDashboard isOpen={isMetricsOpen} onClose={() => setIsMetricsOpen(false)} />
        </AnimatePresence>
      </div>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  )
}

