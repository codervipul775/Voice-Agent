'use client'

import { useEffect, useState, useRef } from 'react'
import { Mic, MicOff, Settings, Activity, LayoutDashboard, Cpu, Sun, Moon, ShieldCheck, Clock, Plus, History, Trash2 } from 'lucide-react'
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
  const {
    state, isConnected, connect, setAudioCallback, sendInterrupt, theme, toggleTheme,
    sessionId, sessions, loadSessions, startNewSession, switchSession, deleteSession
  } = useVoiceStore()
  const { isRecording, startRecording, stopRecording, audioLevel, vadMode, toggleVadMode, cleanup } = useAudioRecorder()
  const { queueAudio, stopAudio } = useAudioPlayer()

  useInterruptDetector({ stopAudio })

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [hasMounted, setHasMounted] = useState(false)
  const [uptime, setUptime] = useState('00:00:00')
  const startTimeRef = useRef(Date.now())

  // Layout states
  const [showTelemetry, setShowTelemetry] = useState(true)
  const [showInterface, setShowInterface] = useState(true)

  useEffect(() => {
    setHasMounted(true)
    loadSessions()
    if (!sessionId) {
      startNewSession()
    }

    const timer = setInterval(() => {
      const diff = Date.now() - startTimeRef.current
      const hours = Math.floor(diff / 3600000).toString().padStart(2, '0')
      const mins = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0')
      const secs = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0')
      setUptime(`${hours}:${mins}:${secs}`)
    }, 1000)

    return () => clearInterval(timer)
  }, [loadSessions, sessionId, startNewSession])

  // Apply theme to body element
  useEffect(() => {
    if (!hasMounted) return
    if (theme === 'light') {
      document.body.classList.add('light-theme')
    } else {
      document.body.classList.remove('light-theme')
    }
  }, [theme, hasMounted])

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

    if (!isConnected && sessionId) {
      await connect(sessionId)
      setTimeout(() => startRecording(), 500)
    } else if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  // Prevent hydration mismatch
  if (!hasMounted) {
    return (
      <div className="h-screen w-full bg-[#02040a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500 animate-pulse" />
          <span className="text-[10px] font-black tracking-[0.4em] text-cyan-500/40 uppercase">Linking...</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`h-screen w-full flex flex-col bg-[var(--background-hex)] overflow-hidden relative font-sans text-[var(--text-primary)] transition-colors duration-500`}>

      {/* Visual Identity Layer */}
      <div className={`mesh-gradient transition-opacity duration-1000 ${theme === 'light' ? 'opacity-80' : 'opacity-40'}`} />
      <div className="noise" />

      {/* Background Ambience */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            x: [0, 80, 0],
            y: [0, 40, 0],
            opacity: theme === 'light' ? [0.05, 0.1, 0.05] : [0.1, 0.2, 0.1]
          }}
          transition={{ duration: 12, repeat: Infinity }}
          className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-cyan-500/10 blur-[120px] rounded-full"
        />
        <motion.div
          animate={{
            x: [0, -80, 0],
            y: [0, -40, 0],
            opacity: theme === 'light' ? [0.05, 0.1, 0.05] : [0.1, 0.15, 0.1]
          }}
          transition={{ duration: 18, repeat: Infinity }}
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/5 blur-[120px] rounded-full"
        />
      </div>

      {/* TOP NAVBAR */}
      <header className="h-16 md:h-20 shrink-0 px-4 md:px-8 flex justify-between items-center relative z-20 border-b border-[var(--glass-border)] bg-[var(--background-hex)]/40 backdrop-blur-md">
        <div className="flex items-center gap-3 md:gap-6">
          <div className="relative shrink-0">
            <div className={`absolute inset-0 blur-xl rounded-full animate-pulse ${theme === 'light' ? 'bg-cyan-500/15' : 'bg-cyan-500/20'}`} />
            <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-gradient-to-br flex items-center justify-center relative z-10 shadow-lg ${theme === 'light' ? 'from-cyan-500 to-blue-600' : 'from-cyan-400 to-blue-600'}`}>
              <Cpu className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
          </div>
          <div className="min-w-0">
            <h1 className="font-heading font-black text-lg md:text-xl tracking-tighter text-[var(--text-primary)] truncate">
              VOICE<span className={theme === 'light' ? 'text-cyan-600' : 'text-cyan-400'}>NEURAL</span>
            </h1>
            <div className={`flex items-center gap-1 md:gap-2 text-[7px] md:text-[8px] font-black tracking-[0.2em] md:tracking-[0.3em] uppercase ${theme === 'light' ? 'text-cyan-600 opacity-80' : 'text-cyan-400 opacity-60'}`}>
              <span className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-current ${isConnected ? 'animate-pulse' : 'opacity-20'}`} />
              <span className="truncate">{isConnected ? 'Active' : 'Offline'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          <div className="flex p-1 rounded-xl glass-panel bg-black/5">
            <button
              onClick={startNewSession}
              className="flex items-center gap-2 px-3 md:px-5 py-2 rounded-lg text-[9px] font-black tracking-widest transition-all text-[var(--text-secondary)] hover:bg-black/5"
              title="New Session"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">NEW_CHAT</span>
            </button>
            <div className="w-[1px] h-4 bg-[var(--glass-border)] my-auto mx-1" />
            <button
              onClick={() => setShowTelemetry(!showTelemetry)}
              className={`flex items-center gap-2 px-3 md:px-5 py-2 rounded-lg text-[9px] font-black tracking-widest transition-all ${showTelemetry ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'text-[var(--text-secondary)] hover:bg-black/5'}`}
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">HISTORY</span>
            </button>
            <button
              onClick={() => setShowInterface(!showInterface)}
              className={`flex items-center gap-2 px-3 md:px-5 py-2 rounded-lg text-[9px] font-black tracking-widest transition-all ${showInterface ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'text-[var(--text-secondary)] hover:bg-black/5'}`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">INTERFACE</span>
            </button>
          </div>

          <div className="hidden md:block h-8 w-[1px] bg-[var(--glass-border)] mx-2" />

          <button onClick={toggleTheme} className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-[var(--accent-primary)]/5 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all glass-panel hover:scale-105">
            {theme === 'dark' ? <Sun className="w-4 h-4 md:w-5 md:h-5" /> : <Moon className="w-4 h-4 md:w-5 md:h-5" />}
          </button>
        </div>
      </header>

      {/* DASHBOARD CORE AREA */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative z-10 p-4 lg:p-6 gap-6">

        {/* LEFT COLUMN: TELEMETRY */}
        <AnimatePresence mode="popLayout">
          {showTelemetry && (
            <motion.section
              initial={{ x: -400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -400, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`
                fixed inset-y-20 left-0 z-40 w-[320px] lg:relative lg:inset-0 lg:z-0
                flex flex-col gap-6 custom-scrollbar overflow-y-auto p-4 lg:rounded-[2.5rem] border-r lg:border border-[var(--glass-border)]
                shadow-2xl lg:shadow-none transition-all duration-300
                ${theme === 'light' ? 'bg-white lg:bg-gradient-to-b from-slate-50 to-cyan-50/30' : 'bg-[#0a0f1a] lg:bg-gradient-to-b from-white/[0.03] to-cyan-500/[0.01]'}
              `}
            >
              <div className="glass-panel rounded-[2rem] p-6 flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--text-secondary)] opacity-40">Signal Integrity</div>
                  <div className={`px-2 py-0.5 rounded-full text-[7px] font-black tracking-widest ${isConnected ? 'bg-cyan-500/10 text-cyan-600' : 'bg-red-500/10 text-red-600'}`}>
                    {isConnected ? 'SPEECH ACTIVE' : 'NO LINK'}
                  </div>
                </div>
                {isConnected ? <AudioStats /> : <div className="h-32 flex items-center justify-center border border-dashed border-[var(--glass-border)] rounded-2xl text-[8px] font-black text-slate-400 tracking-widest uppercase">Initializing...</div>}
              </div>

              <div className="flex-1 min-h-0 flex flex-col gap-6">
                {/* Session History Section */}
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between px-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--text-secondary)] opacity-40">Chat History</div>
                    <Clock className="w-3.5 h-3.5 text-[var(--text-secondary)] opacity-20" />
                  </div>

                  <button
                    onClick={startNewSession}
                    className="flex items-center gap-3 w-full p-4 rounded-2xl border border-[var(--glass-border)] bg-cyan-500/5 hover:bg-cyan-500/10 text-cyan-600 transition-all group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-cyan-500 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 group-hover:scale-110 transition-transform">
                      <Plus className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest">New Session</span>
                  </button>

                  <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto no-scrollbar pr-1">
                    {sessions.length === 0 ? (
                      <div className="p-4 rounded-2xl border border-dashed border-[var(--glass-border)] text-[8px] font-black text-slate-400 tracking-widest text-center uppercase">
                        No prior links found
                      </div>
                    ) : (
                      sessions.map((session) => (
                        <div
                          key={session.id}
                          className={`group relative flex flex-col gap-1 p-3 rounded-2xl transition-all border cursor-pointer ${sessionId === session.id ? 'bg-cyan-500/10 border-cyan-500/30' : 'border-transparent hover:bg-black/5 sm:hover:border-[var(--glass-border)]'}`}
                          onClick={() => switchSession(session.id)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[10px] font-black truncate ${sessionId === session.id ? 'text-cyan-600' : 'text-[var(--text-primary)]'}`}>
                              {session.title}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                              className="opacity-0 group-hover:opacity-40 hover:opacity-100 p-1 rounded-lg transition-opacity"
                            >
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </button>
                          </div>
                          {session.lastMessage && (
                            <p className="text-[8px] text-[var(--text-secondary)] truncate line-clamp-1 opacity-60">
                              {session.lastMessage}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex-1">
                  <MetricsDashboard embedded={true} />
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* CENTER COLUMN: AGENT & CONTROLS */}
        <section className={`flex-1 flex flex-col items-center justify-between py-6 lg:py-12 relative ${showTelemetry || showInterface ? 'opacity-20 lg:opacity-100 pointer-events-none lg:pointer-events-auto' : ''} transition-opacity duration-300`}>

          <div className="flex flex-col items-center gap-2 mb-auto">
            <div className={`px-4 py-1 rounded-full text-[8px] font-black tracking-[0.3em] uppercase bg-white/50 backdrop-blur-sm border border-[var(--glass-border)] ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
              {state === 'listening' ? 'Analyzing Signal' : state === 'speaking' ? 'Active Link' : 'Processing'}
            </div>
          </div>

          <div className="relative group">
            <div className={`absolute inset-0 bg-cyan-400/20 blur-[100px] rounded-full scale-150 transition-opacity duration-1000 ${state !== 'idle' ? 'opacity-100' : 'opacity-0'}`} />
            <AgentAvatar state={state} audioLevel={audioLevel} />
          </div>

          <div className="flex flex-col items-center gap-1 text-center px-4">
            <h2 className="text-2xl lg:text-4xl font-black tracking-tighter font-heading text-[var(--text-primary)]">Neural Core Active</h2>
            <p className={`text-xs text-center max-w-sm leading-relaxed ${theme === 'light' ? 'text-slate-500' : 'text-slate-400 opacity-60'}`}>
              Voice communication link established. System monitoring biological responses in real-time.
            </p>
          </div>

          {/* Centered Control Dock */}
          <div className="glass-panel rounded-[2rem] p-3 flex items-center gap-4 border-[var(--glass-border)] shadow-2xl">
            <div className="flex flex-col items-start px-4 lg:px-6 border-r border-[var(--glass-border)]">
              <span className={`text-[7px] font-black tracking-[0.3em] uppercase mb-1 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Protocol</span>
              <button onClick={toggleVadMode} disabled={isRecording} className={`text-[9px] lg:text-[10px] font-black tracking-widest transition-all ${vadMode ? 'text-cyan-600' : 'text-[var(--text-secondary)]'} disabled:opacity-50`}>
                {vadMode ? 'VAD ACTIVE' : 'PTT PROTOCOL'}
              </button>
            </div>

            <div className="flex items-center gap-3 pr-6">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-3 rounded-xl hover:bg-black/5 text-[var(--text-secondary)]"
                title="Microphone Settings"
              >
                <Settings className="w-4 h-4" />
              </button>

              <button
                onClick={handleToggleConnection}
                className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-xl ${isRecording ? 'bg-cyan-500 shadow-cyan-500/40 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-400'}`}
              >
                {isRecording ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: NEURAL FEED & MODULES */}
        <AnimatePresence mode="popLayout">
          {showInterface && (
            <motion.section
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`
                fixed inset-y-20 right-0 z-40 w-full md:w-[380px] lg:relative lg:inset-0 lg:z-0
                flex flex-col gap-6 overflow-hidden p-4 lg:rounded-[2.5rem] border-l lg:border border-[var(--glass-border)]
                shadow-2xl lg:shadow-none transition-all duration-300
                ${theme === 'light' ? 'bg-white lg:bg-gradient-to-b from-slate-50 to-indigo-50/30' : 'bg-[#0a0f1a] lg:bg-gradient-to-b from-white/[0.03] to-indigo-500/[0.01]'}
              `}
            >
              <div className="flex-1 flex flex-col glass-panel rounded-[2.5rem] overflow-hidden">
                <div className="p-6 border-b border-[var(--glass-border)] flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-[0.4em] text-[var(--text-primary)]">NEURAL_FEED</h3>
                  <button className="p-1 hover:bg-black/5 rounded-lg text-[var(--text-secondary)]">
                    <Activity className="w-4 h-4 opacity-40" />
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <LiveCaptions />
                </div>
              </div>

              <div className="glass-panel rounded-[2.5rem] p-6 flex flex-col gap-4">
                <div className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-secondary)] opacity-40">ACTIVE_RESOURCES</div>
                <div className="flex flex-wrap gap-2">
                  {['STT (Deepgram)', 'LLM (GROQ)', 'TTS (Cartesia)'].map((mod) => (
                    <div key={mod} className={`px-3 py-1.5 rounded-lg text-[8px] font-black tracking-widest uppercase border ${theme === 'light' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'}`}>
                      {mod}
                    </div>
                  ))}
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

      </main>

      {/* BOTTOM STATUS BAR */}
      <footer className="h-12 shrink-0 border-t border-[var(--glass-border)] bg-[var(--background-hex)]/60 backdrop-blur-md px-8 flex items-center justify-between relative z-20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`} />
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">Secure Link Established</span>
          </div>
          <div className="flex items-center gap-2 pl-6 border-l border-[var(--glass-border)]">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-600/60" />
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">Encryption: Active (AES-256)</span>
          </div>
        </div>

        <div className="flex items-center gap-6 text-[8px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">
          <div className="flex items-center gap-2 pr-6 border-r border-[var(--glass-border)]">
            <span>System Uptime:</span>
            <span className="font-mono text-emerald-600">{uptime}</span>
          </div>
          <div className="flex items-center gap-2">
            <span>Neural Link Suite</span>
            <span className="text-cyan-600">V2.0</span>
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {isSettingsOpen && (
          <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        )}
      </AnimatePresence>
    </div >
  )
}
