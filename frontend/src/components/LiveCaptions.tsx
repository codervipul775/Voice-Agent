'use client'

import { useEffect, useRef, memo, useState } from 'react'
import { useVoiceStore } from '@/store/voiceStore'
import { Bot, User, Download, Sparkles, Mic, FileText, Code, Table, ChevronDown, Send } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Caption {
  id: string
  speaker: 'user' | 'assistant'
  text: string
  timestamp: number
  isFinal: boolean
}

const ChatBubble = memo(({ caption, theme }: { caption: Caption, theme: 'dark' | 'light' }) => (
  <motion.div
    initial={{ opacity: 0, y: 10, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    layout
    className={`mb-6 flex flex-col ${caption.speaker === 'user' ? 'items-end' : 'items-start'}`}
  >
    {/* Header */}
    <div className={`flex items-center gap-2 mb-1 px-1 text-[8px] font-black tracking-[0.2em] ${caption.speaker === 'user' ? `flex-row-reverse ${theme === 'light' ? 'text-emerald-600' : 'text-emerald-400'}` : `flex-row ${theme === 'light' ? 'text-cyan-600' : 'text-cyan-400'}`}`}>
      <span className="opacity-40">{caption.speaker === 'user' ? 'USER' : 'SYSTEM'}</span>
      <span className={`font-mono text-[8px] ${theme === 'light' ? 'text-slate-400' : 'text-white/20'}`}>
        {new Date(caption.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    </div>

    {/* Bubble */}
    <div
      className={`
        px-4 py-2.5 rounded-2xl text-[12px] leading-relaxed transition-all duration-300 relative shadow-sm border
        ${caption.speaker === 'user'
          ? `rounded-tr-sm ${theme === 'light' ? 'bg-[#f0f9ff] border-blue-100 text-slate-800' : 'bg-emerald-500/10 border-emerald-500/20 text-white'}`
          : `rounded-tl-sm ${theme === 'light' ? 'bg-white border-slate-100 text-slate-800' : 'bg-white/5 border-white/10 text-white'}`
        }
        ${!caption.isFinal && 'opacity-60 border-dashed animate-pulse'}
      `}
    >
      <span className="relative z-10 font-medium">{caption.text}</span>
    </div>
  </motion.div>
));

ChatBubble.displayName = 'ChatBubble';

// Interim transcript bubble
const InterimBubble = memo(({ text, theme }: { text: string, theme: 'dark' | 'light' }) => (
  <motion.div
    initial={{ opacity: 0, y: 5 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -5 }}
    className="mb-6 flex flex-col items-end"
  >
    <div className="flex items-center gap-2 mb-1 px-1 text-[8px] font-black tracking-[0.2em] flex-row-reverse text-amber-500">
      <Mic className="w-2.5 h-2.5 animate-pulse" />
      <span>LISTENING</span>
    </div>

    <div className={`px-4 py-2.5 rounded-2xl rounded-tr-sm text-[12px] leading-relaxed relative border border-dashed ${theme === 'light' ? 'bg-amber-50/50 border-amber-200 text-slate-700' : 'bg-amber-500/10 border-amber-500/20 text-white/80'}`}>
      <span className="relative z-10 font-medium italic">
        {text}
        <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="inline-block w-[1px] h-[12px] bg-amber-500 ml-1 align-middle" />
      </span>
    </div>
  </motion.div>
));

InterimBubble.displayName = 'InterimBubble';

export default function LiveCaptions({ layout = 'default' }: { layout?: 'default' | 'compact' }) {
  const { captions, interimText, theme } = useVoiceStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [hasMounted, setHasMounted] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setHasMounted(true)
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [captions.length, interimText])

  const downloadFile = (content: string, type: string, extension: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `neural-log-${Date.now()}.${extension}`; a.click();
    URL.revokeObjectURL(url); setIsExportOpen(false);
  }

  return (
    <div className="h-full flex flex-col relative overflow-hidden p-6 pt-2">
      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-2 custom-scrollbar no-scrollbar">
        <AnimatePresence mode="popLayout" initial={false}>
          {!hasMounted ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          ) : captions.length === 0 && !interimText ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`flex flex-col items-center justify-center h-full text-[9px] gap-4 uppercase font-black tracking-[0.4em] ${theme === 'light' ? 'text-slate-300' : 'text-white/5'}`}>
              <Sparkles className="w-6 h-6" />
              <p>Awaiting Uplink</p>
            </motion.div>
          ) : (
            <>
              {captions.map((caption) => <ChatBubble key={caption.id} caption={caption} theme={theme} />)}
              {interimText && <InterimBubble text={interimText} theme={theme} />}
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
