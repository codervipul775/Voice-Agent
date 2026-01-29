'use client'

import { useState, useEffect } from 'react'
import { X, Mic, Activity, Volume2 } from 'lucide-react'
import { useVoiceStore } from '@/store/voiceStore'

interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const { theme } = useVoiceStore()
    const [deviceList, setDeviceList] = useState<MediaDeviceInfo[]>([])
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')

    useEffect(() => {
        if (isOpen) {
            navigator.mediaDevices.enumerateDevices().then(devices => {
                const audioInputs = devices.filter(d => d.kind === 'audioinput')
                setDeviceList(audioInputs)
                if (!selectedDeviceId && audioInputs.length > 0) {
                    setSelectedDeviceId(audioInputs[0].deviceId)
                }
            })
        }
    }, [isOpen, selectedDeviceId])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]" style={{ backgroundColor: theme === 'light' ? 'rgba(15, 23, 42, 0.4)' : 'rgba(0, 0, 0, 0.6)' }}>
            <div className="w-full max-w-md bg-[var(--background-hex)] border border-[var(--glass-border)] rounded-2xl shadow-2xl overflow-hidden glass-panel">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--glass-border)]" style={{ backgroundColor: theme === 'light' ? 'rgba(248, 250, 252, 0.5)' : 'rgba(2, 4, 10, 0.5)' }}>
                    <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Activity className={`w-5 h-5 ${theme === 'light' ? 'text-cyan-600' : 'text-cyan-400'}`} />
                        Settings
                    </h2>
                    <button onClick={onClose} className={`p-1 rounded-full transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)] ${theme === 'light' ? 'hover:bg-slate-200' : 'hover:bg-[var(--accent-primary)]/5'}`}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">

                    {/* Audio Input */}
                    <div>
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2 ${theme === 'light' ? 'text-slate-600' : 'text-[var(--text-secondary)] opacity-60'}`}>
                            <Mic className="w-4 h-4" />
                            Microphone Input
                        </label>
                        <select
                            value={selectedDeviceId}
                            onChange={(e) => setSelectedDeviceId(e.target.value)}
                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all ${theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-[var(--background-hex)] border-[var(--glass-border)] text-[var(--text-primary)]'}`}
                        >
                            {deviceList.map(device => (
                                <option key={device.deviceId} value={device.deviceId} className={theme === 'light' ? 'bg-white text-slate-900' : 'bg-[#0f172a] text-white'}>
                                    {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                                </option>
                            ))}
                            {deviceList.length === 0 && <option value="" className={theme === 'light' ? 'bg-white text-slate-900' : 'bg-[#0f172a] text-white'}>Default Microphone</option>}
                        </select>
                    </div>

                    {/* VAD Settings (Mock for now, but UI ready) */}
                    <div>
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2 ${theme === 'light' ? 'text-slate-600' : 'text-[var(--text-secondary)] opacity-60'}`}>
                            <Volume2 className="w-4 h-4" />
                            VAD Sensitivity
                        </label>
                        <div className={`rounded-lg p-3 border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-[var(--background-hex)]/50 border-[var(--glass-border)]'}`}>
                            <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
                                <span>Sensitive</span>
                                <span>Relaxed</span>
                            </div>
                            <input type="range" className={`w-full accent-cyan-400 h-1 rounded-lg appearance-none cursor-pointer ${theme === 'light' ? 'bg-slate-200' : 'bg-[var(--glass-border)]'}`} />
                        </div>
                    </div>

                    {/* Info */}
                    <div className={`p-3 rounded-lg border text-xs leading-relaxed font-bold ${theme === 'light' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'}`}>
                        <strong className={`block mb-1 uppercase tracking-widest text-[10px] ${theme === 'light' ? 'text-indigo-600' : 'text-indigo-500'}`}>Neural Protocol</strong>
                        Version 1.2.4 <br />
                        Signal Link Established
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-[var(--glass-border)] flex justify-end" style={{ backgroundColor: theme === 'light' ? 'rgba(248, 250, 252, 0.3)' : 'rgba(2, 4, 10, 0.3)' }}>
                    <button
                        onClick={onClose}
                        className={`px-4 py-2 font-bold rounded-lg text-sm transition-colors shadow-lg ${theme === 'light' ? 'bg-cyan-600 text-white shadow-cyan-600/20 hover:bg-cyan-700' : 'bg-[var(--accent-primary)] text-white shadow-cyan-500/10 hover:bg-cyan-400'}`}
                    >
                        Done
                    </button>
                </div>

            </div>
        </div>
    )
}
