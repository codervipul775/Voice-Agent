import { VoiceState } from '@/store/voiceStore'

interface StateIndicatorProps {
  state: VoiceState
  isRecording: boolean
}

export default function StateIndicator({ state, isRecording }: StateIndicatorProps) {

  const getStatusConfig = () => {
    switch (state) {
      case 'listening':
        return {
          text: isRecording ? 'Listening' : 'Ready',
          color: 'bg-emerald-500',
          pulse: true,
          icon: '👂'
        }
      case 'thinking':
        return {
          text: 'Thinking',
          color: 'bg-indigo-500',
          pulse: true,
          icon: '🧠'
        }
      case 'speaking':
        return {
          text: 'Speaking',
          color: 'bg-sky-500',
          pulse: true,
          icon: '🗣️'
        }
      case 'error':
        return {
          text: 'Error',
          color: 'bg-rose-500',
          pulse: false,
          icon: '⚠️'
        }
      default:
        return {
          text: 'Idle',
          color: 'bg-slate-500',
          pulse: false,
          icon: '💤'
        }
    }
  }

  const config = getStatusConfig()

  return (
    <div className="flex items-center justify-center">
      <div className={`
        px-4 py-2 rounded-full
        bg-opacity-20 backdrop-blur-md border border-white/10
        flex items-center gap-3
        transition-all duration-300
        ${config.color.replace('bg-', 'bg-opacity-10 bg-')}
      `}>
        <div className={`
          relative w-3 h-3 rounded-full ${config.color}
          ${config.pulse ? 'animate-pulse' : ''}
          shadow-[0_0_10px_currentColor]
        `}>
          {config.pulse && (
            <div className={`absolute inset-0 rounded-full ${config.color} animate-ping opacity-75`} />
          )}
        </div>

        <span className="text-sm font-medium tracking-wide uppercase text-white/90">
          {config.text}
        </span>
      </div>
    </div>
  )
}
