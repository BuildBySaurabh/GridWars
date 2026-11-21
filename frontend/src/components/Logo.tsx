import { Grid3x3 } from 'lucide-react'

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-12 w-12 rounded-2xl' : 'h-9 w-9 rounded-xl'
  const icon = size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'
  const text = size === 'lg' ? 'text-3xl' : 'text-xl'
  return (
    <div className="flex items-center gap-3">
      <span
        className={`${box} grid place-items-center bg-linear-to-br from-brand to-accent text-white shadow-[0_0_20px_-4px_rgb(25_181_255/0.6)]`}
        aria-hidden="true"
      >
        <Grid3x3 className={icon} strokeWidth={2.4} />
      </span>
      <span className={`font-display ${text} font-bold tracking-tight`}>
        Grid<span className="text-brand">Wars</span>
      </span>
    </div>
  )
}
