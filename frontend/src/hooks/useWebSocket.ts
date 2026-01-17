import { useVoiceStore } from '@/store/voiceStore'

export function useWebSocket() {
  const { isConnected, connect, disconnect, sendAudio } = useVoiceStore()

  return {
    isConnected,
    connect,
    disconnect,
    sendAudio
  }
}
