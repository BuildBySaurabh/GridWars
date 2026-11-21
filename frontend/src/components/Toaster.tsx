import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'

import { useToastStore, type ToastKind } from '../store/toastStore'

const STYLE: Record<ToastKind, { icon: typeof Info; ring: string; tint: string }> = {
  success: { icon: CircleCheck, ring: 'border-ok/40', tint: 'text-ok' },
  error: { icon: TriangleAlert, ring: 'border-bad/40', tint: 'text-bad' },
  info: { icon: Info, ring: 'border-brand/40', tint: 'text-brand' },
}

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6"
    >
      {toasts.map((toast) => {
        const { icon: Icon, ring, tint } = STYLE[toast.kind]
        return (
          <div
            key={toast.id}
            role={toast.kind === 'error' ? 'alert' : 'status'}
            className={`toast-enter pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border ${ring} bg-panel px-4 py-3 text-sm shadow-xl shadow-black/50`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tint}`} aria-hidden="true" />
            <p className="flex-1 leading-snug">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="cursor-pointer rounded p-0.5 text-muted hover:text-fg"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
