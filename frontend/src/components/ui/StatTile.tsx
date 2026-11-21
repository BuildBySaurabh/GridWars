import { useChangeFlash } from '../../lib/useChangeFlash'

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const flash = useChangeFlash(value)
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-[11px] tracking-wide text-muted uppercase">{label}</p>
      <p className={`font-display text-2xl font-semibold tabular-nums ${flash ? 'flash-up' : ''}`}>{value}</p>
      {hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
    </div>
  )
}
