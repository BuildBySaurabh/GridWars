import type { HTMLAttributes, ReactNode } from 'react'

interface PanelProps extends HTMLAttributes<HTMLElement> {
  title?: string
  icon?: ReactNode
  action?: ReactNode
  padded?: boolean
}

/** Card surface used by every sidebar block and view. */
export function Panel({ title, icon, action, padded = true, className = '', children, ...props }: PanelProps) {
  return (
    <section className={`rounded-2xl border border-line bg-panel shadow-panel ${padded ? 'p-4' : ''} ${className}`} {...props}>
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold tracking-wide">
            {icon ? <span className="text-brand">{icon}</span> : null}
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}
