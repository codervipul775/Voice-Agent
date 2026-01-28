'use client'

import { useEffect, useRef, memo } from 'react'
import { useVoiceStore } from '@/store/voiceStore'
import { Bot, User, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Caption {
  id: string
  speaker: 'user' | 'assistant'
  text: string
  timestamp: number
  isFinal: boolean
}

const ChatBubble = memo(({ caption }: { caption: Caption }) => (
  <motion.div
    initial={{ opacity: 0, y: 10, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    layout
    className={`
      mb-6 flex flex-col
      ${caption.speaker === 'user' ? 'items-end' : 'items-start'}
    `}
  >
    {/* Header */}
    <div className={`flex items-center gap-2 mb-2 px-1 text-[9px] font-black tracking-[0.2em] ${caption.speaker === 'user' ? 'flex-row-reverse text-emerald-400' : 'flex-row text-cyan-400'}`}>
      <div className="flex items-center gap-1.5 opacity-70">
        {caption.speaker === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
        <span>{caption.speaker === 'user' ? 'USER' : 'SYSTEM'}</span>
      </div>
      <span className="text-white/20 font-mono text-[8px]">{new Date(caption.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
    </div>

    {/* Bubble */}
    <div
      className={`
        px-5 py-3.5 rounded-2xl max-w-[90%] text-[13px] leading-relaxed transition-all duration-300 relative overflow-hidden glass-panel
        ${caption.speaker === 'user'
          ? 'rounded-tr-sm border-emerald-500/20 text-emerald-50/90'
          : 'rounded-tl-sm border-cyan-500/20 text-cyan-50/90'
        }
        ${!caption.isFinal && 'opacity-60 border-dashed animate-pulse'}
      `}
    >
      {/* Subtle Gradient Overlay */}
      <div className={`absolute inset-0 opacity-10 pointer-events-none ${caption.speaker === 'user' ? 'bg-gradient-to-br from-emerald-500/20 to-transparent' : 'bg-gradient-to-br from-cyan-500/20 to-transparent'}`} />

      <span className="relative z-10">{caption.text}</span>
    </div>
  </motion.div>
));

ChatBubble.displayName = 'ChatBubble';

import TranscriptExport from './TranscriptExport'

export default function LiveCaptions() {
  const { captions } = useVoiceStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  const captionsLength = captions.length;
  const lastCaptionText = captions[captions.length - 1]?.text;

  useEffect(() => {
    if (scrollRef.current) {
      const { scrollHeight, clientHeight } = scrollRef.current;
      scrollRef.current.scrollTo({
        top: scrollHeight - clientHeight,
        behavior: 'smooth'
      });
    }
  }, [captionsLength, lastCaptionText])

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-2 pr-4 custom-scrollbar"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {captions.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-white/10 text-xs gap-4 uppercase font-black tracking-[0.5em]"
            >
              <Sparkles className="w-8 h-8 opacity-20" />
              <p>Awaiting Link</p>
            </motion.div>
          ) : (
            captions.map((caption) => (
              <ChatBubble key={caption.id} caption={caption} />
            ))
          )}
        </AnimatePresence>
        <div className="h-8" />
      </div>

      {/* Action Bar */}
      {captions.length > 0 && (
        <div className="pt-4 border-t border-white/5 bg-gradient-to-t from-black/20 to-transparent">
          <TranscriptExport />
        </div>
      )}
    </div>
  )
}


