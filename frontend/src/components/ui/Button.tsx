import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-linear-to-r from-brand to-accent text-white shadow-[0_6px_20px_-8px_rgb(25_181_255/0.7)] hover:brightness-110 hover:shadow-[0_8px_26px_-8px_rgb(147_51_234/0.8)]',
  secondary: 'border border-line bg-panel text-fg hover:border-brand/50 hover:bg-surface',
  ghost: 'text-muted hover:bg-white/5 hover:text-fg',
  danger: 'border border-bad/50 bg-bad/10 text-[#ff8a8a] hover:bg-bad/20',
}
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

/** The one button style. Defaults to type="button" so it never submits a form by accident. */
export function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex cursor-pointer items-center justify-center rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  )
}
