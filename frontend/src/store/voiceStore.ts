import { create } from 'zustand'

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

interface Caption {
  id: string
  speaker: 'user' | 'assistant'
  text: string
  timestamp: number
  isFinal: boolean
}

interface VoiceStore {
  // Connection state
  isConnected: boolean
  ws: WebSocket | null
  
  // Voice state
  state: VoiceState
  
  // Captions
  captions: Caption[]
  
  // Audio callback
  onAudioReceived: ((audioData: string) => void) | null
  
  // Actions
  connect: (sessionId: string) => Promise<void>
  disconnect: () => void
  setState: (state: VoiceState) => void
  addCaption: (caption: Caption) => void
  updateLastCaption: (text: string) => void
  sendAudio: (audioData: Blob) => void
  setAudioCallback: (callback: (audioData: string) => void) => void
}

export const useVoiceStore = create<VoiceStore>((set, get) => ({
  isConnected: false,
  ws: null,
  state: 'idle',
  captions: [],
  onAudioReceived: null,

  connect: async (sessionId: string) => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'
    const ws = new WebSocket(`${wsUrl}/voice/${sessionId}`)

    ws.onopen = () => {
      console.log('WebSocket connected')
      set({ isConnected: true, ws, state: 'listening' })
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log('📨 WS Message:', data.type, data)
        
        if (data.type === 'state_change') {
          set({ state: data.state })
        } else if (data.type === 'transcript_update') {
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
            // Replace the last interim caption with this one (interim or final)
            set((state) => ({
              captions: [...state.captions.slice(0, -1), caption]
            }))
          } else if (data.data.is_final) {
            // Only add final captions as new entries
            set((state) => ({
              captions: [...state.captions, caption]
            }))
          } else {
            // Add new interim caption only if previous was final or different speaker
            set((state) => ({
              captions: [...state.captions, caption]
            }))
          }
        } else if (data.type === 'audio') {
          // Handle audio playback
          console.log('Received audio chunk, length:', data.data?.length)
          const { onAudioReceived } = get()
          if (onAudioReceived && data.data) {
            onAudioReceived(data.data)
          }
        } else if (data.type === 'error') {
          console.error('❌ Server error:', data.message)
          // Don't disconnect on error, just go back to listening
          set({ state: 'listening' })
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
    set({ isConnected: false, ws: null, state: 'idle' })
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
    console.log('📡 sendAudio called, ws:', !!ws, 'connected:', isConnected, 'size:', audioData.size)
    if (ws && isConnected) {
      console.log('📨 Sending audio to WebSocket...')
      ws.send(audioData)
      console.log('✅ Audio sent')
    } else {
      console.error('❌ Cannot send audio - not connected')
    }
  },

  setAudioCallback: (callback: (audioData: string) => void) => {
    set({ onAudioReceived: callback })
  }
}))
