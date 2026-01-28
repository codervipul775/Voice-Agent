'use client'

import { useState, useEffect } from 'react'
import { X, Mic, Activity, Volume2 } from 'lucide-react'

interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const [deviceList, setDeviceList] = useState<MediaDeviceInfo[]>([])
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')

    useEffect(() => {
        if (isOpen) {
            navigator.mediaDevices.enumerateDevices().then(devices => {
                const audioInputs = devices.filter(d => d.kind === 'audioinput')
                setDeviceList(audioInputs)
                // Set current if finding one with 'default' or first
                if (!selectedDeviceId && audioInputs.length > 0) {
                    setSelectedDeviceId(audioInputs[0].deviceId)
                }
            })
        }
    }, [isOpen, selectedDeviceId])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/5 bg-slate-800/50">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Activity className="w-5 h-5 text-cyan-400" />
                        Settings
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">

                    {/* Audio Input */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                            <Mic className="w-4 h-4" />
                            Microphone Input
                        </label>
                        <select
                            value={selectedDeviceId}
                            onChange={(e) => setSelectedDeviceId(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                        >
                            {deviceList.map(device => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                                </option>
                            ))}
                            {deviceList.length === 0 && <option>Default Microphone</option>}
                        </select>
                    </div>

                    {/* VAD Settings (Mock for now, but UI ready) */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                            <Volume2 className="w-4 h-4" />
                            VAD Sensitivity
                        </label>
                        <div className="bg-slate-950/50 rounded-lg p-3 border border-white/5">
                            <div className="flex justify-between text-xs text-slate-400 mb-1">
                                <span>Sensitive</span>
                                <span>Relaxed</span>
                            </div>
                            <input type="range" className="w-full accent-cyan-400 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                        </div>
                    </div>

                    {/* Info */}
                    <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-xs leading-relaxed">
                        <strong className="text-indigo-400 block mb-1">About VoiceOS</strong>
                        Version 1.0.0 • Day 2 Build<br />
                        Connected to Local Backend
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/5 bg-slate-800/30 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-100 hover:bg-white text-slate-900 font-bold rounded-lg text-sm transition-colors shadow-lg shadow-cyan-500/10"
                    >
                        Done
                    </button>
                </div>

            </div>
        </div>
    )
}
