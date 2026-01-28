'use client'

import { useVoiceStore } from '@/store/voiceStore'
import { WifiOff, RefreshCw, AlertCircle, Link } from 'lucide-react'

interface ConnectionStatusProps {
  compact?: boolean
}

export default function ConnectionStatus({ compact = false }: ConnectionStatusProps) {
  const { isConnected, state, connectionState } = useVoiceStore()

  const getStatusConfig = () => {
    if (state === 'reconnecting') {
      return {
        icon: RefreshCw,
        text: `RECON`,
        subText: `${connectionState.attempts}/${connectionState.maxAttempts}`,
        color: 'text-amber-400',
        animate: 'animate-spin'
      }
    }

    if (state === 'error') {
      return {
        icon: AlertCircle,
        text: 'SIGNAL_ERROR',
        subText: 'CRITICAL',
        color: 'text-rose-400',
        animate: ''
      }
    }

    if (isConnected) {
      return {
        icon: Link,
        text: 'LINK_ACTIVE',
        subText: 'SECURE',
        color: 'text-cyan-400',
        animate: ''
      }
    }

    return {
      icon: WifiOff,
      text: 'LINK_OFFLINE',
      subText: 'STANDBY',
      color: 'text-white/20',
      animate: ''
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 rounded-2xl glass-pill transition-all duration-300`}
      role="status"
    >
      <div className={`p-1.5 rounded-lg bg-white/5 border border-white/5`}>
        <Icon className={`w-3.5 h-3.5 ${config.color} ${config.animate}`} />
      </div>
      <div className="flex flex-col">
        <span className={`text-[9px] font-black tracking-[0.2em] leading-none ${config.color}`}>
          {config.text}
        </span>
        {!compact && (
          <span className="text-[8px] font-mono text-white/20 tracking-tighter mt-1">
            {config.subText}
          </span>
        )}
      </div>
    </div>
  )
}

