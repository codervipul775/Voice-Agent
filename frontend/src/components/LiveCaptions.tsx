'use client'

import { useEffect, useRef, memo } from 'react'
import { useVoiceStore } from '@/store/voiceStore'
import { Download, Bot, User, Clock } from 'lucide-react'

// Memoized Chat Bubble
const ChatBubble = memo(({ caption }: { caption: any }) => (
  <div
    className={`
      mb-4 flex flex-col animate-[fadeIn_0.3s_ease-out_forwards]
      ${caption.speaker === 'user' ? 'items-end' : 'items-start'}
    `}
  >
    {/* Header */}
    <div className={`flex items-center gap-2 mb-1 text-[10px] uppercase font-bold tracking-wider ${caption.speaker === 'user' ? 'flex-row-reverse text-emerald-400' : 'flex-row text-cyan-400'}`}>
      <span>{caption.speaker === 'user' ? 'You' : 'AI'}</span>
      <span className="text-slate-600 font-normal normal-case">{new Date(caption.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    </div>

    {/* Bubble */}
    <div
      className={`
        px-4 py-3 rounded-2xl max-w-[90%] text-sm leading-relaxed shadow-sm
        ${caption.speaker === 'user'
          ? 'bg-emerald-900/20 border border-emerald-500/20 text-emerald-100 rounded-tr-sm'
          : 'bg-slate-800/50 border border-white/10 text-slate-200 rounded-tl-sm'
        }
        ${!caption.isFinal && 'opacity-70 border-dashed'}
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
