import type { ReactNode } from 'react'

export function EmptyState({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
      {icon ? <span className="text-brand/70">{icon}</span> : null}
      <p>{children}</p>
    </div>
  )
}
