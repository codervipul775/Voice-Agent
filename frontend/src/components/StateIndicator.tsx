'use client'

interface StateIndicatorProps {
  state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'
  isRecording?: boolean
}

export default function StateIndicator({ state, isRecording }: StateIndicatorProps) {
  // Override state display based on actual recording status
  const displayState = state === 'listening' && !isRecording ? 'idle' : state
  
  const stateConfig = {
    idle: {
      text: '💤 Idle',
      color: 'bg-gray-500',
      description: 'Click the microphone to start'
    },
    listening: {
      text: '🎤 Listening...',
      color: 'bg-green-500',
      description: "I'm listening to you"
    },
    thinking: {
      text: '🤔 Thinking...',
      color: 'bg-yellow-500',
      description: 'Processing your request'
    },
    speaking: {
      text: '🔊 Speaking...',
      color: 'bg-blue-500',
      description: 'AI is responding'
    },
    error: {
      text: '❌ Error',
      color: 'bg-red-500',
      description: 'Something went wrong'
    }
  }

  const config = stateConfig[displayState]

  return (
    <div className="text-center">
      <div className={`inline-flex items-center gap-3 px-6 py-3 rounded-full ${config.color} text-white shadow-lg`}>
        <span className="text-xl font-semibold">{config.text}</span>
        {displayState !== 'idle' && displayState !== 'error' && (
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        )}
      </div>
      <p className="text-gray-400 text-sm mt-2">{config.description}</p>
    </div>
  )
}
