import { create } from 'zustand'
import { toast } from './toastStore'

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error' | 'reconnecting'

interface Caption {
  id: string
  speaker: 'user' | 'assistant'
  text: string
  timestamp: number
  isFinal: boolean
}

export interface SessionMetadata {
  id: string
  title: string
  timestamp: number
  lastMessage?: string
}

interface AudioMetrics {
  rms: number
  peak: number
  snr_db: number
  quality_score: number
  quality_label: string
  duration_ms: number
}

interface VadStatus {
  is_speech: boolean
  speech_ended: boolean
}

interface ConnectionState {
  attempts: number
  maxAttempts: number
  lastError: string | null
}

interface VoiceStore {
  // Connection state
  isConnected: boolean
  ws: WebSocket | null
  connectionState: ConnectionState
  sessionId: string | null

  // Voice state
  state: VoiceState

  // Captions
  captions: Caption[]

  // Audio metrics 
  audioMetrics: AudioMetrics | null

  // VAD status
  vadStatus: VadStatus

  // Audio callback
  onAudioReceived: ((audioData: string) => void) | null

  // Real-time interim transcript (word-by-word)
  interimText: string
  interimMessageId: string | null

  // Theme
  theme: 'dark' | 'light'

  // Sessions History
  sessions: SessionMetadata[]

  // Actions
  toggleTheme: () => void
  loadSessions: () => void
  startNewSession: () => void
  switchSession: (sessionId: string) => void
  deleteSession: (sessionId: string) => void
  connect: (sessionId: string) => Promise<void>
  disconnect: () => void
  setState: (state: VoiceState) => void
  addCaption: (caption: Caption) => void
  updateLastCaption: (text: string, isFinal?: boolean) => void
  sendAudio: (audioData: Blob) => void
  sendInterrupt: () => void  // Barge-in interrupt
  setAudioCallback: (callback: (audioData: string) => void) => void
  setAudioMetrics: (metrics: AudioMetrics) => void
  setVadStatus: (status: VadStatus) => void
  resetConnection: () => void
}

// Exponential backoff helper
const getReconnectDelay = (attempt: number): number => {
  const baseDelay = 1000
  const maxDelay = 30000
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
  return delay + Math.random() * 1000 // Add jitter
}

export const useVoiceStore = create<VoiceStore>((set, get) => ({
  isConnected: false,
  ws: null,
  state: 'idle',
  captions: [],
  audioMetrics: null,
  vadStatus: { is_speech: false, speech_ended: false },
  onAudioReceived: null,
  sessionId: null,
  connectionState: {
    attempts: 0,
    maxAttempts: 5,
    lastError: null
  },
  interimText: '',
  interimMessageId: null,
  theme: typeof window !== 'undefined' && localStorage.getItem('voice-theme') === 'light' ? 'light' : 'dark',
  sessions: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('voice_sessions_meta') || '[]') : [],

  toggleTheme: () => {
    set((state) => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark'
      if (typeof window !== 'undefined') {
        localStorage.setItem('voice-theme', newTheme)
      }
      return { theme: newTheme }
    })
  },

  connect: async (sessionId: string) => {
    const { connectionState, ws: existingWs } = get()

    // Close existing connection if any
    if (existingWs) {
      existingWs.close()
    }

    // Check max attempts
    if (connectionState.attempts >= connectionState.maxAttempts) {
      toast.error('Connection Failed', 'Maximum reconnection attempts reached. Please refresh the page.')
      set({ state: 'error' })
      return
    }

    set({
      sessionId,
      state: connectionState.attempts > 0 ? 'reconnecting' : 'idle'
    })

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'

    try {
      const ws = new WebSocket(`${wsUrl}/voice/${sessionId}`)

      // Connection timeout
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close()
          toast.warning('Connection Timeout', 'Server is taking too long to respond')
        }
      }, 10000)

      ws.onopen = () => {
        clearTimeout(connectionTimeout)

        set({
          isConnected: true,
          ws,
          state: 'listening',
          connectionState: { attempts: 0, maxAttempts: 5, lastError: null }
        })

        if (connectionState.attempts > 0) {
          toast.success('Reconnected', 'Connection restored successfully')
        }
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)


          switch (data.type) {
            case 'state_change':
              set({ state: data.state })
              break

            case 'transcript_update': {
              const caption: Caption = {
                id: data.data.id,
                speaker: data.data.speaker,
                text: data.data.text,
                timestamp: data.data.timestamp * 1000,
                isFinal: data.data.is_final
              }

              const { captions, addCaption, updateLastCaption } = get()
              const lastCaption = captions[captions.length - 1]
              const clearInterim = data.data.is_final && data.data.speaker === 'user'

              if (lastCaption && lastCaption.speaker === caption.speaker && !lastCaption.isFinal) {
                updateLastCaption(caption.text, caption.isFinal)
              } else {
                addCaption(caption)
              }

              if (clearInterim) {
                set({ interimText: '', interimMessageId: null })
              }
              break
            }

            case 'audio': {

              const { onAudioReceived } = get()
              if (onAudioReceived && data.data) {
                onAudioReceived(data.data)
              }
              break
            }

            case 'audio_metrics': {
              set({ audioMetrics: data.data })
              break
            }

            case 'vad_status': {
              set({ vadStatus: data.data })
              break
            }

            case 'interrupt_ack': {

              set({ state: 'listening' })
              break
            }

            case 'error':

              toast.error('Server Error', data.message || 'An unexpected error occurred')
              set({ state: 'listening' })
              break

            case 'interim_transcript': {
              // Real-time word-by-word transcript display
              const interimText = data.data.text || ''
              const interimId = data.data.id
              set({ interimText, interimMessageId: interimId })

              break
            }
          }
        } catch (_error) {
          console.error('Error parsing WebSocket message:', _error)
        }
      }

      ws.onerror = () => {
        clearTimeout(connectionTimeout)

        set((state) => ({
          state: 'error',
          connectionState: {
            ...state.connectionState,
            lastError: 'WebSocket connection error'
          }
        }))
      }

      ws.onclose = (event) => {
        clearTimeout(connectionTimeout)


        const { sessionId, connectionState } = get()
        set({ isConnected: false, ws: null })

        // Don't reconnect if intentionally closed or max attempts reached
        if (event.code === 1000) {
          set({ state: 'idle' })
          return
        }

        // Increment attempts and schedule reconnect
        const newAttempts = connectionState.attempts + 1
        set((state) => ({
          state: 'reconnecting',
          connectionState: {
            ...state.connectionState,
            attempts: newAttempts
          }
        }))

        if (newAttempts < connectionState.maxAttempts && sessionId) {
          const delay = getReconnectDelay(newAttempts)

          toast.warning('Connection Lost', `Reconnecting in ${Math.round(delay / 1000)} seconds...`)

          setTimeout(() => {
            get().connect(sessionId)
          }, delay)
        } else {
          toast.error('Connection Failed', 'Unable to reconnect. Please refresh the page.')
          set({ state: 'error' })
        }
      }
    } catch {
      toast.error('Connection Error', 'Failed to establish connection')
      set({ state: 'error' })
    }
  },

  disconnect: () => {
    const { ws } = get()
    if (ws) {
      ws.close(1000, 'User disconnected') // Normal closure
    }
    set({
      isConnected: false,
      ws: null,
      state: 'idle',
      audioMetrics: null,
      connectionState: { attempts: 0, maxAttempts: 5, lastError: null }
    })
  },

  resetConnection: () => {
    const { sessionId } = get()
    set({ connectionState: { attempts: 0, maxAttempts: 5, lastError: null } })
    if (sessionId) {
      get().connect(sessionId)
    }
  },

  setState: (state: VoiceState) => {
    set({ state })
  },

  addCaption: (caption: Caption) => {
    set((state) => {
      const updatedCaptions = [...state.captions, caption]

      if (state.sessionId) {
        localStorage.setItem(`captions_${state.sessionId}`, JSON.stringify(updatedCaptions))

        const updatedSessions = [...state.sessions]
        const idx = updatedSessions.findIndex(s => s.id === state.sessionId)
        if (idx >= 0) {
          updatedSessions[idx] = { ...updatedSessions[idx], lastMessage: caption.text, timestamp: Date.now() }
        } else {
          updatedSessions.unshift({
            id: state.sessionId,
            title: `Neural Session ${new Date().toLocaleTimeString()}`,
            timestamp: Date.now(),
            lastMessage: caption.text
          })
        }
        localStorage.setItem('voice_sessions_meta', JSON.stringify(updatedSessions))
        return { captions: updatedCaptions, sessions: updatedSessions }
      }
      return { captions: updatedCaptions }
    })
  },

  updateLastCaption: (text: string, isFinal?: boolean) => {
    set((state) => {
      const captions = [...state.captions]
      if (captions.length > 0) {
        const idx = captions.length - 1
        const last = captions[idx]

        // Defensive: Don't overwrite content with empty text during streaming
        if (!text && last.text && isFinal === undefined) {
          return { captions: state.captions }
        }

        // Fix: Create NEW object to trigger re-render in memo components
        const updatedCaption = {
          ...last,
          text: text || last.text,
          isFinal: isFinal !== undefined ? isFinal : last.isFinal
        }
        captions[idx] = updatedCaption

        if (state.sessionId) {
          localStorage.setItem(`captions_${state.sessionId}`, JSON.stringify(captions))
          const updatedSessions = [...state.sessions]
          const sid = updatedSessions.findIndex(s => s.id === state.sessionId)

          if (sid >= 0) {
            updatedSessions[sid] = { ...updatedSessions[sid], lastMessage: updatedCaption.text, timestamp: Date.now() }
          } else {
            updatedSessions.unshift({
              id: state.sessionId,
              title: `Neural Session ${new Date().toLocaleTimeString()}`,
              timestamp: Date.now(),
              lastMessage: updatedCaption.text
            })
          }
          localStorage.setItem('voice_sessions_meta', JSON.stringify(updatedSessions))
          return { captions, sessions: updatedSessions }
        }
      }
      return { captions }
    })
  },

  sendAudio: (audioData: Blob) => {
    const { ws, isConnected } = get()
    if (ws && isConnected) {

      ws.send(audioData)
    } else {
      console.error('Cannot send audio - not connected')
    }
  },

  sendInterrupt: () => {
    const { ws, isConnected, state } = get()
    if (ws && isConnected && state === 'speaking') {

      ws.send(JSON.stringify({ type: 'interrupt' }))
      set({ state: 'listening' })
    }
  },

  setAudioCallback: (callback: (audioData: string) => void) => {
    set({ onAudioReceived: callback })
  },

  setAudioMetrics: (metrics: AudioMetrics) => {
    set({ audioMetrics: metrics })
  },

  setVadStatus: (status: VadStatus) => {
    set({ vadStatus: status })
  },

  loadSessions: () => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem('voice_sessions_meta')
    if (saved) {
      try {
        set({ sessions: JSON.parse(saved) })
      } catch (e) {
        console.error('Failed to load sessions:', e)
      }
    }
  },

  startNewSession: () => {
    const { disconnect, sessionId } = get()

    // Save current session before switching if it has data
    if (sessionId) {
      const { captions, sessions } = get()
      if (captions.length > 0) {
        const updatedSessions = sessions.map(s =>
          s.id === sessionId
            ? { ...s, lastMessage: captions[captions.length - 1].text, timestamp: Date.now() }
            : s
        )
        set({ sessions: updatedSessions })
        localStorage.setItem('voice_sessions_meta', JSON.stringify(updatedSessions))
      }
    }

    disconnect()
    set({
      sessionId: crypto.randomUUID(),
      captions: [],
      state: 'idle',
      interimText: '',
      interimMessageId: null
    })
  },

  switchSession: (targetId: string) => {
    const { disconnect } = get()
    disconnect()

    // Load captions from localStorage
    const savedCaptions = localStorage.getItem(`captions_${targetId}`)
    const captions = savedCaptions ? JSON.parse(savedCaptions) : []

    set({
      sessionId: targetId,
      captions,
      state: 'idle',
      interimText: '',
      interimMessageId: null
    })
  },

  deleteSession: (id: string) => {
    const { sessions, sessionId, startNewSession } = get()
    const updated = sessions.filter(s => s.id !== id)
    set({ sessions: updated })
    localStorage.setItem('voice_sessions_meta', JSON.stringify(updated))
    localStorage.removeItem(`captions_${id}`)

    if (sessionId === id) {
      startNewSession()
    }
  }
}))
