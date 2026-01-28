'use client'

import { useToastStore, ToastType } from '@/store/toastStore'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-emerald-400" />,
  error: <AlertCircle className="w-5 h-5 text-rose-400" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-400" />,
  info: <Info className="w-5 h-5 text-cyan-400" />
}

const bgMap: Record<ToastType, string> = {
  success: 'bg-emerald-500/10 border-emerald-500/20',
  error: 'bg-rose-500/10 border-rose-500/20',
  warning: 'bg-amber-500/10 border-amber-500/20',
  info: 'bg-cyan-500/10 border-cyan-500/20'
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            flex items-start gap-3 p-4 rounded-xl border backdrop-blur-xl
            shadow-2xl animate-[slideIn_0.3s_ease-out_forwards]
            ${bgMap[toast.type]}
          `}
        >
          <div className="flex-shrink-0 mt-0.5">
            {iconMap[toast.type]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{toast.title}</p>
            {toast.message && (
              <p className="text-xs text-slate-400 mt-1">{toast.message}</p>
            )}
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="flex-shrink-0 p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  )
}
