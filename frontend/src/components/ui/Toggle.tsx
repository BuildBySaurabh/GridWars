import { useId } from 'react'

interface ToggleProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

/** Accessible switch (role="switch") with a visible label and description. */
export function Toggle({ label, description, checked, onChange }: ToggleProps) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p id={`${id}-l`} className="text-sm font-medium">{label}</p>
        {description ? <p id={`${id}-d`} className="text-xs text-muted">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={description ? `${id}-d` : undefined}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition ${
          checked ? 'border-brand bg-brand/30' : 'border-line bg-surface'
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 h-4.5 w-4.5 rounded-full bg-fg transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  )
}
