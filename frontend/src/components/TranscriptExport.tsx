'use client'

import { useState } from 'react'
import { Download, FileText, FileJson, Copy, Check, ChevronDown } from 'lucide-react'
import { useVoiceStore } from '@/store/voiceStore'

interface TranscriptExportProps {
  className?: string
}

export default function TranscriptExport({ className = '' }: TranscriptExportProps) {
  const { captions } = useVoiceStore()
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  // Generate formatted text transcript
  const generateTextTranscript = () => {
    const header = `=== Voice Assistant Transcript ===\n`
    const date = `Date: ${new Date().toLocaleDateString()}\n`
    const time = `Time: ${new Date().toLocaleTimeString()}\n`
    const divider = `${'='.repeat(35)}\n\n`
    
    const messages = captions.map(c => {
      const timestamp = new Date(c.timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      })
      const speaker = c.speaker === 'user' ? '👤 You' : '🤖 AI'
      return `[${timestamp}] ${speaker}:\n${c.text}\n`
    }).join('\n')

    const footer = `\n${'='.repeat(35)}\nTotal messages: ${captions.length}`
    
    return header + date + time + divider + messages + footer
  }

  // Generate JSON transcript
  const generateJsonTranscript = () => {
    return JSON.stringify({
      metadata: {
        exportedAt: new Date().toISOString(),
        messageCount: captions.length,
        duration: captions.length > 0 
          ? `${Math.round((captions[captions.length - 1].timestamp - captions[0].timestamp) / 1000)}s`
          : '0s'
      },
      messages: captions.map(c => ({
        id: c.id,
        speaker: c.speaker,
        text: c.text,
        timestamp: new Date(c.timestamp).toISOString(),
        isFinal: c.isFinal
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
    const filename = `transcript-${new Date().toISOString().split('T')[0]}.txt`
    downloadFile(content, filename, 'text/plain')
    setIsOpen(false)
  }

  const exportAsJson = () => {
    const content = generateJsonTranscript()
    const filename = `transcript-${new Date().toISOString().split('T')[0]}.json`
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
    <div className={`relative ${className}`}>
      {/* Main Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 hover:bg-slate-700/80 
                   text-slate-300 hover:text-white rounded-lg border border-white/10 
                   transition-all duration-200 text-sm font-medium backdrop-blur-sm
                   shadow-lg hover:shadow-cyan-500/10"
      >
        <Download className="w-4 h-4" />
        <span>Export</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu */}
          <div className="absolute right-0 mt-2 w-52 bg-slate-900/95 backdrop-blur-xl 
                         rounded-xl border border-white/10 shadow-2xl z-50 overflow-hidden
                         animate-[slideIn_0.15s_ease-out_forwards]">
            
            {/* Header */}
            <div className="px-4 py-2.5 border-b border-white/5 bg-slate-800/50">
              <p className="text-xs text-slate-400 font-medium">
                {captions.length} messages
              </p>
            </div>

            {/* Options */}
            <div className="p-1.5">
              {/* Text Export */}
              <button
                onClick={exportAsTxt}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                         hover:bg-white/5 text-slate-300 hover:text-white 
                         transition-colors group"
              >
                <div className="p-1.5 rounded-lg bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors">
                  <FileText className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">Plain Text</p>
                  <p className="text-[10px] text-slate-500">.txt format</p>
                </div>
              </button>

              {/* JSON Export */}
              <button
                onClick={exportAsJson}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                         hover:bg-white/5 text-slate-300 hover:text-white 
                         transition-colors group"
              >
                <div className="p-1.5 rounded-lg bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
                  <FileJson className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">JSON</p>
                  <p className="text-[10px] text-slate-500">Structured data</p>
                </div>
              </button>

              {/* Copy to Clipboard */}
              <button
                onClick={copyToClipboard}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                         hover:bg-white/5 text-slate-300 hover:text-white 
                         transition-colors group"
              >
                <div className="p-1.5 rounded-lg bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-emerald-400" />
                  )}
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">{copied ? 'Copied!' : 'Copy to Clipboard'}</p>
                  <p className="text-[10px] text-slate-500">Quick share</p>
                </div>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Animation keyframes */}
      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}
