'use client'

import { useEffect, useRef } from 'react'
import { useVoiceStore } from '@/store/voiceStore'
import { Download } from 'lucide-react'

export default function LiveCaptions() {
  const { captions } = useVoiceStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [captions])

  const exportTranscript = () => {
    const text = captions.map(c => 
      `[${new Date(c.timestamp).toLocaleTimeString()}] ${c.speaker === 'user' ? 'You' : 'AI'}: ${c.text}`
    ).join('\n')

    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transcript-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-slate-900/50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold">Live Transcript</h3>
        {captions.length > 0 && (
          <button
            onClick={exportTranscript}
            className="flex items-center gap-2 px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        )}
      </div>

      <div 
        ref={scrollRef}
        className="h-64 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
      >
        {captions.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>Transcript will appear here...</p>
          </div>
        ) : (
          captions.map((caption) => (
            <div
              key={caption.id}
              className={`
                p-3 rounded-lg animate-fade-in
                ${caption.speaker === 'user' 
                  ? 'bg-green-900/30 ml-0 mr-8' 
                  : 'bg-blue-900/30 ml-8 mr-0'
                }
                ${caption.isFinal ? '' : 'opacity-60 italic'}
              `}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-gray-400">
                  {caption.speaker === 'user' ? '👤 You' : '🤖 AI'}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(caption.timestamp).toLocaleTimeString()}
                </span>
                {!caption.isFinal && (
                  <span className="text-xs text-yellow-500">interim</span>
                )}
              </div>
              <p className="text-white">{caption.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
