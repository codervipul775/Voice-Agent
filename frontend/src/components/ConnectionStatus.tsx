'use client'

import { useVoiceStore } from '@/store/voiceStore'
import { WifiOff, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'

interface ConnectionStatusProps {
  compact?: boolean
}

export default function ConnectionStatus({ compact = false }: ConnectionStatusProps) {
  const { isConnected, state, connectionState } = useVoiceStore()

  const getStatusConfig = () => {
    if (state === 'reconnecting') {
      return {
        icon: RefreshCw,
        text: `Reconnecting (${connectionState.attempts}/${connectionState.maxAttempts})`,
        shortText: 'Reconnecting...',
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/30',
        animate: 'animate-spin'
      }
    }
    
    if (state === 'error') {
      return {
        icon: AlertCircle,
        text: connectionState.lastError || 'Connection Error',
        shortText: 'Error',
        color: 'text-rose-400',
        bgColor: 'bg-rose-500/10',
        borderColor: 'border-rose-500/30',
        animate: ''
      }
    }
    
    if (isConnected) {
      return {
        icon: CheckCircle2,
        text: 'Connected',
        shortText: 'Online',
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-emerald-500/30',
        animate: ''
      }
    }
    
    return {
      icon: WifiOff,
      text: 'Disconnected',
      shortText: 'Offline',
      color: 'text-slate-400',
      bgColor: 'bg-slate-500/10',
      borderColor: 'border-slate-500/30',
      animate: ''
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon

  if (compact) {
    return (
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${config.bgColor} border ${config.borderColor}`}
        role="status"
        aria-live="polite"
        aria-label={`Connection status: ${config.text}`}
      >
        <Icon className={`w-3 h-3 ${config.color} ${config.animate}`} />
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${config.color}`}>
          {config.shortText}
        </span>
      </div>
    )
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-xl ${config.bgColor} border ${config.borderColor} transition-all duration-300`}
      role="status"
      aria-live="polite"
      aria-label={`Connection status: ${config.text}`}
    >
      <Icon className={`w-4 h-4 ${config.color} ${config.animate}`} />
      <div className="flex flex-col">
        <span className={`text-xs font-semibold ${config.color}`}>
          {config.text}
        </span>
        {state === 'reconnecting' && connectionState.attempts > 0 && (
          <span className="text-[10px] text-slate-500">
            Attempt {connectionState.attempts} of {connectionState.maxAttempts}
          </span>
        )}
      </div>
    </div>
  )
}
