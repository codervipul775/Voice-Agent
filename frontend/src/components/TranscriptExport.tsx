'use client'

import { useState } from 'react'
import { Download, FileText, FileJson, Copy, Check, ChevronDown } from 'lucide-react'
import { useVoiceStore } from '@/store/voiceStore'
import { motion, AnimatePresence } from 'framer-motion'

interface TranscriptExportProps {
  className?: string
}

export default function TranscriptExport({ className = '' }: TranscriptExportProps) {
  const { captions } = useVoiceStore()
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  // Generate formatted text transcript
  const generateTextTranscript = () => {
    const header = `=== Voice Neural Signal Log ===\n`
    const date = `Date: ${new Date().toLocaleDateString()}\n`
    const time = `Time: ${new Date().toLocaleTimeString()}\n`
    const divider = `${'='.repeat(35)}\n\n`

    const messages = captions.map(c => {
      const timestamp = new Date(c.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
      const speaker = c.speaker === 'user' ? '👤 YOU' : '🤖 NEURAL'
      return `[${timestamp}] ${speaker}:\n${c.text}\n`
    }).join('\n')

    const footer = `\n${'='.repeat(35)}\nTotal Events: ${captions.length}`

    return header + date + time + divider + messages + footer
  }

  // Generate JSON transcript
  const generateJsonTranscript = () => {
    return JSON.stringify({
      metadata: {
        exportedAt: new Date().toISOString(),
        eventCount: captions.length,
        session_duration: captions.length > 0
          ? `${Math.round((captions[captions.length - 1].timestamp - captions[0].timestamp) / 1000)}s`
          : '0s'
      },
      events: captions.map(c => ({
        id: c.id,
        entity: c.speaker,
        text: c.text,
        timestamp: new Date(c.timestamp).toISOString(),
        status: c.isFinal ? 'committed' : 'streaming'
      }))
    }, null, 2)
  }

  // Download as file
  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // Export handlers
  const exportAsTxt = () => {
    const content = generateTextTranscript()
    const filename = `neural-log-${Date.now()}.txt`
    downloadFile(content, filename, 'text/plain')
    setIsOpen(false)
  }

  const exportAsJson = () => {
    const content = generateJsonTranscript()
    const filename = `neural-data-${Date.now()}.json`
    downloadFile(content, filename, 'application/json')
    setIsOpen(false)
  }

  const copyToClipboard = async () => {
    const content = generateTextTranscript()
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    setIsOpen(false)
  }

  if (captions.length === 0) return null

  return (
    <div className={`relative w-full ${className}`}>
      {/* Main Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black tracking-[0.2em] text-white/40 hover:text-white/80 hover:bg-white/5 transition-all glass-pill group"
      >
        <Download className="w-3.5 h-3.5" />
        <span>EXPORT SIGNAL LOG</span>
        <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''} opacity-20 group-hover:opacity-100`} />
      </button>

      {/* Futuristic Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-3 z-[70]">
            {/* Backdrop for click-away */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60]"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="glass-panel rounded-2xl border border-white/10 shadow-2xl relative z-[70] overflow-hidden"
            >
              <div className="p-2 space-y-1">
                {/* Text Export */}
                <button
                  onClick={exportAsTxt}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition-all group"
                >
                  <div className="p-2 rounded-lg bg-cyan-500/10 group-hover:bg-cyan-500/20 transition-colors">
                    <FileText className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-black text-white/80 tracking-widest uppercase mb-0.5">Plain Text</p>
                    <p className="text-[8px] text-white/20 font-bold uppercase tracking-widest">Raw Log Protocol</p>
                  </div>
                </button>

                {/* JSON Export */}
                <button
                  onClick={exportAsJson}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition-all group"
                >
                  <div className="p-2 rounded-lg bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
                    <FileJson className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-black text-white/80 tracking-widest uppercase mb-0.5">JSON Dataset</p>
                    <p className="text-[8px] text-white/20 font-bold uppercase tracking-widest">Structured Neural Data</p>
                  </div>
                </button>

                {/* Copy to Clipboard */}
                <button
                  onClick={copyToClipboard}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition-all group"
                >
                  <div className="p-2 rounded-lg bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-emerald-400" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-black text-white/80 tracking-widest uppercase mb-0.5">
                      {copied ? 'Captured!' : 'Quick Buffer'}
                    </p>
                    <p className="text-[8px] text-white/20 font-bold uppercase tracking-widest">Clipboard Transfer</p>
                  </div>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
