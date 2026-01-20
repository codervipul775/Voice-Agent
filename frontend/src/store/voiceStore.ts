import { create } from 'zustand'

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

interface Caption {
  id: string
  speaker: 'user' | 'assistant'
  text: string
  timestamp: number
  isFinal: boolean
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

interface VoiceStore {
  // Connection state
  isConnected: boolean
  ws: WebSocket | null

  // Voice state
  state: VoiceState

  // Captions
  captions: Caption[]

  // Audio metrics (Day 2 feature)
  audioMetrics: AudioMetrics | null

  // VAD status (Day 2 feature)
  vadStatus: VadStatus

  // Audio callback
  onAudioReceived: ((audioData: string) => void) | null

  // Actions
  connect: (sessionId: string) => Promise<void>
  disconnect: () => void
  setState: (state: VoiceState) => void
  addCaption: (caption: Caption) => void
  updateLastCaption: (text: string) => void
  sendAudio: (audioData: Blob) => void
  sendInterrupt: () => void  // Barge-in interrupt
  setAudioCallback: (callback: (audioData: string) => void) => void
  setAudioMetrics: (metrics: AudioMetrics) => void
  setVadStatus: (status: VadStatus) => void
}

export const useVoiceStore = create<VoiceStore>((set, get) => ({
  isConnected: false,
  ws: null,
  state: 'idle',
  captions: [],
  audioMetrics: null,
  vadStatus: { is_speech: false, speech_ended: false },
  onAudioReceived: null,

  connect: async (sessionId: string) => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'
    const ws = new WebSocket(`${wsUrl}/voice/${sessionId}`)

    ws.onopen = () => {
      console.log('✅ WebSocket connected')
      set({ isConnected: true, ws, state: 'listening' })
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log('📨 WS Message:', data.type)

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

            const captions = get().captions
            const lastCaption = captions[captions.length - 1]

            // Check if this is an update to the last caption (same speaker)
            if (lastCaption && lastCaption.speaker === caption.speaker && !lastCaption.isFinal) {
              // Replace the last interim caption with this one
              set((state) => ({
                captions: [...state.captions.slice(0, -1), caption]
              }))
            } else if (data.data.is_final) {
              // Only add final captions as new entries
              set((state) => ({
                captions: [...state.captions, caption]
              }))
            } else {
              // Add new interim caption
              set((state) => ({
                captions: [...state.captions, caption]
              }))
            }
            break
          }

          case 'audio': {
            // Handle audio playback
            console.log('🔊 Received audio chunk, length:', data.data?.length)
            const { onAudioReceived } = get()
            if (onAudioReceived && data.data) {
              onAudioReceived(data.data)
            }
            break
          }

          case 'audio_metrics': {
            // Handle audio quality metrics (Day 2 feature)
            console.log('📊 Audio metrics:', data.data)
            set({ audioMetrics: data.data })
            break
          }

          case 'vad_status': {
            // Handle VAD status (Day 2 feature)
            console.log('🎙️ VAD status:', data.data)
            set({ vadStatus: data.data })
            break
          }

          case 'interrupt_ack': {
            // Handle interrupt acknowledgment (Day 4 barge-in)
            console.log('🛑 Interrupt acknowledged:', data.message)
            set({ state: 'listening' })
            break
          }

          case 'error':
            console.error('❌ Server error:', data.message)
            // Don't disconnect on error, just go back to listening
            set({ state: 'listening' })
            break
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      set({ state: 'error' })
    }

    ws.onclose = () => {
      console.log('🔌 WebSocket closed - reconnecting in 2s...')
      set({ isConnected: false, ws: null, state: 'idle' })

      // Auto-reconnect after 2 seconds
      setTimeout(() => {
        console.log('♻️ Attempting to reconnect...')
        get().connect(sessionId)
      }, 2000)
    }
  },

  disconnect: () => {
    const { ws } = get()
    if (ws) {
      ws.close()
    }
    set({ isConnected: false, ws: null, state: 'idle', audioMetrics: null })
  },

  setState: (state: VoiceState) => {
    set({ state })
  },

  addCaption: (caption: Caption) => {
    set((state) => ({
      captions: [...state.captions, caption]
    }))
  },

  updateLastCaption: (text: string) => {
    set((state) => {
      const captions = [...state.captions]
      if (captions.length > 0) {
        captions[captions.length - 1].text = text
      }
      return { captions }
    })
  },

  sendAudio: (audioData: Blob) => {
    const { ws, isConnected } = get()
    if (ws && isConnected) {
      console.log('📤 Sending audio:', audioData.size, 'bytes')
      ws.send(audioData)
    } else {
      console.error('❌ Cannot send audio - not connected')
    }
  },

  sendInterrupt: () => {
    const { ws, isConnected, state } = get()
    if (ws && isConnected && state === 'speaking') {
      console.log('🛑 Sending interrupt signal')
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
  }
}))
