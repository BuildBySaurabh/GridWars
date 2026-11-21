import { LoaderCircle, MousePointerClick, Trophy, Zap } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'

import { ApiError } from '../api/client'
import { Logo } from '../components/Logo'
import { Button } from '../components/ui/Button'
import { PRESET_COLORS, isHexColor, randomPresetColor, usernameHint } from '../lib/validation'
import { controller } from '../services/gameController'

interface FormErrors {
  username?: string
  color?: string
  form?: string
}

/** First message for a field from a DRF-style `details` object. */
function fieldMessage(details: Record<string, unknown>, field: string): string | undefined {
  const value = details[field]
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return typeof value === 'string' ? value : undefined
}

function errorsFromApi(error: unknown): FormErrors {
  if (!(error instanceof ApiError)) return { form: 'Something went wrong. Please try again.' }
  if (error.code === 'validation_error') {
    const username = fieldMessage(error.details, 'username')
    const color = fieldMessage(error.details, 'color')
    if (username || color) return { username, color }
  }
  if (error.code === 'username_taken') return { username: error.message }
  if (error.status === 429) {
    const wait = error.details.retry_after_seconds
    return { form: `Too many attempts. Please wait ${typeof wait === 'number' ? `${wait} seconds` : 'a moment'} and try again.` }
  }
  return { form: error.message }
}

function HeroGrid() {
  // Purely decorative: a deterministic scatter of pulsing cells.
  const palette = ['#19B5FF', '#9333EA', '#19B5FF', '#22C55E', '#9333EA']
  return (
    <div aria-hidden="true" className="grid grid-cols-10 gap-1.5 opacity-90">
      {Array.from({ length: 100 }, (_, i) => {
        const hash = (i * 2654435761) >>> 0
        const lit = hash % 100 < 38
        return (
          <span
            key={i}
            className="aspect-square rounded-[4px]"
            style={{
              backgroundColor: lit ? palette[hash % palette.length] : 'var(--color-cell)',
              animation: lit ? `hero-pulse ${2.4 + (hash % 17) / 10}s ease-in-out ${(hash % 23) / 10}s infinite` : undefined,
              opacity: lit ? undefined : 0.6,
            }}
          />
        )
      })}
    </div>
  )
}

const POINTS = [
  { icon: MousePointerClick, title: 'Claim a cell', text: 'Click any unclaimed square on the 25 × 25 board.' },
  { icon: Zap, title: 'See it live', text: 'Every capture appears for everyone, instantly.' },
  { icon: Trophy, title: 'Take the lead', text: 'First come, first served. Climb the leaderboard.' },
]

export function WelcomePage() {
  const nameId = useId()
  const hintId = useId()
  const [username, setUsername] = useState('')
  const [color, setColor] = useState(() => randomPresetColor())
  const [touched, setTouched] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)

  const localHint = touched ? usernameHint(username) : null
  const usernameError = errors.username ?? localHint

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    const hint = usernameHint(username)
    if (hint) {
      setErrors({ username: hint })
      return
    }
    if (!isHexColor(color)) {
      setErrors({ color: 'Pick a valid color.' })
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      await controller.join(username, color)
    } catch (error) {
      setErrors(errorsFromApi(error))
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
      <section className="fade-up space-y-8">
        <Logo size="lg" />
        <div className="space-y-4">
          <h1 className="font-display text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl">
            One grid.
            <br />
            <span className="bg-linear-to-r from-brand to-accent bg-clip-text text-transparent">
              Everyone racing for it.
            </span>
          </h1>
          <p className="max-w-lg text-base leading-relaxed text-muted">
            GridWars is a shared board of 625 cells. Pick a name and a color, then capture cells before anyone else does.
            If two players click the same cell at the same moment, exactly one of you gets it.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-3">
          {POINTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-2xl border border-line bg-panel p-3.5">
              <Icon className="mb-2 h-5 w-5 text-brand" aria-hidden="true" />
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ul>
        <div className="hidden max-w-xs lg:block">
          <HeroGrid />
        </div>
      </section>

      <section className="fade-up rounded-3xl border border-line bg-panel p-6 shadow-panel sm:p-8" style={{ animationDelay: '0.1s' }}>
        <h2 className="font-display text-2xl font-semibold">Join the grid</h2>
        <p className="mt-1 text-sm text-muted">No account needed. Just a name and a color.</p>

        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-6">
          <div>
            <label htmlFor={nameId} className="mb-1.5 block text-sm font-medium">
              Username
            </label>
            <input
              id={nameId}
              value={username}
              onChange={(event) => {
                setUsername(event.target.value)
                if (errors.username) setErrors((current) => ({ ...current, username: undefined }))
              }}
              onBlur={() => setTouched(true)}
              maxLength={20}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="e.g. Saurabh"
              aria-invalid={Boolean(usernameError)}
              aria-describedby={hintId}
              className={`w-full rounded-xl border bg-surface px-4 py-3 text-base outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/25 ${
                usernameError ? 'border-bad/70' : 'border-line'
              }`}
            />
            <p id={hintId} role={usernameError ? 'alert' : undefined} className={`mt-1.5 min-h-4 text-xs ${usernameError ? 'text-bad' : 'text-muted'}`}>
              {usernameError ?? '3–20 characters: letters, numbers, _ or -'}
            </p>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Your color</legend>
            <div role="radiogroup" aria-label="Preset colors" className="flex flex-wrap items-center gap-2.5">
              {PRESET_COLORS.map((preset) => {
                const selected = preset.toLowerCase() === color.toLowerCase()
                return (
                  <button
                    key={preset}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`Color ${preset}`}
                    onClick={() => setColor(preset)}
                    className={`h-9 w-9 rounded-xl transition hover:scale-110 ${
                      selected ? 'ring-2 ring-white ring-offset-2 ring-offset-panel' : 'ring-1 ring-white/15'
                    }`}
                    style={{ backgroundColor: preset }}
                  />
                )
              })}
              <label className="relative grid h-9 w-9 cursor-pointer place-items-center rounded-xl border border-dashed border-line text-xs text-muted transition hover:border-brand">
                <span aria-hidden="true">+</span>
                <span className="sr-only">Custom color</span>
                <input
                  type="color"
                  value={isHexColor(color) ? color.toLowerCase() : '#19b5ff'}
                  onChange={(event) => setColor(event.target.value.toUpperCase())}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
            </div>
            {errors.color ? (
              <p role="alert" className="mt-2 text-xs text-bad">
                {errors.color}
              </p>
            ) : null}
            <div className="mt-3 flex items-center gap-2 text-xs text-muted">
              <span className="h-4 w-4 rounded-[4px] ring-1 ring-white/30" style={{ backgroundColor: color }} aria-hidden="true" />
              Your cells will look like this · <span className="font-mono">{color.toUpperCase()}</span>
            </div>
          </fieldset>

          {errors.form ? (
            <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
              {errors.form}
            </p>
          ) : null}

          <Button type="submit" variant="primary" size="lg" disabled={submitting} className="w-full">
            {submitting ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Joining…
              </>
            ) : (
              'Join Grid'
            )}
          </Button>
        </form>
      </section>
    </main>
  )
}
