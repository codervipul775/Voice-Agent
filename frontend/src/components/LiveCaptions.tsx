'use client'

import { useEffect, useRef, memo } from 'react'
import { useVoiceStore } from '@/store/voiceStore'
import { Bot, User, Clock, Download } from 'lucide-react'

interface Caption {
  id: string
  speaker: 'user' | 'assistant'
  text: string
  timestamp: number
  isFinal: boolean
}

// Memoized Chat Bubble
const ChatBubble = memo(({ caption }: { caption: Caption }) => (
  <div
    className={`
      mb-7 flex flex-col animate-[fadeIn_0.5s_cubic-bezier(0.23,1,0.32,1)_forwards]
      ${caption.speaker === 'user' ? 'items-end' : 'items-start'}
    `}
  >
    {/* Header */}
    <div className={`flex items-center gap-2 mb-2 px-1 text-[10px] uppercase font-bold tracking-[0.2em] ${caption.speaker === 'user' ? 'flex-row-reverse text-emerald-400' : 'flex-row text-cyan-400'}`}>
      <div className="flex items-center gap-1.5">
        {caption.speaker === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3 text-cyan-400" />}
        <span>{caption.speaker === 'user' ? 'Direct Signal' : 'Response Link'}</span>
      </div>
      <span className="text-slate-600 font-normal tracking-tighter mx-1 opacity-50">/</span>
      <span className="text-slate-600 font-medium font-mono text-[9px]">{new Date(caption.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
    </div>

    {/* Bubble */}
    <div
      className={`
        px-5 py-3.5 rounded-2xl max-w-[95%] text-[13px] leading-relaxed shadow-xl transition-all duration-300
        ${caption.speaker === 'user'
          ? 'bg-gradient-to-br from-emerald-600/10 to-emerald-900/20 border border-emerald-500/20 text-emerald-50/90 rounded-tr-sm'
          : 'bg-gradient-to-br from-slate-800/40 to-slate-900/60 border border-white/5 text-slate-100/90 rounded-tl-sm'
        }
        ${!caption.isFinal && 'opacity-60 border-dashed bg-transparent shadow-none'}
      `}
    >
      {caption.text}
    </div>
  </div>
));

ChatBubble.displayName = 'ChatBubble';

export default function LiveCaptions() {
  const { captions } = useVoiceStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll logic
  useEffect(() => {
    if (scrollRef.current) {
      const { scrollHeight, clientHeight } = scrollRef.current;
      scrollRef.current.scrollTo({
        top: scrollHeight - clientHeight,
        behavior: 'smooth'
      });
    }
  }, [captions.length, captions[captions.length - 1]?.text])

  const exportTranscript = () => {
    const text = captions.map(c =>
      `[${new Date(c.timestamp).toLocaleTimeString()}] ${c.speaker === 'user' ? 'You' : 'AI'}: ${c.text}`
    ).join('\n')

    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `voice-transcript-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full flex flex-col relative">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
      >
        {captions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 text-sm gap-2 opacity-50">
            <Clock className="w-8 h-8 opacity-50" />
            <p>History empty</p>
          </div>
        ) : (
          captions.map((caption) => (
            <ChatBubble key={caption.id} caption={caption} />
          ))
        )}
        <div className="h-4" /> {/* Spacer */}
      </div>

      {/* Floating Actions */}
      {captions.length > 0 && (
        <div className="absolute bottom-2 right-2 z-10">
          <button
            onClick={exportTranscript}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-full shadow-lg border border-white/5 transition-all"
            title="Download Transcript"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
