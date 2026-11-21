import { RotateCw, TriangleAlert } from 'lucide-react'

import { Button } from './ui/Button'

export function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="grid place-items-center gap-3 rounded-2xl border border-line bg-panel px-6 py-16 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-bad/15 text-bad">
        <TriangleAlert className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="max-w-sm text-sm text-muted">{message}</p>
      <Button variant="primary" className="mt-2" onClick={onRetry}>
        <RotateCw className="h-4 w-4" aria-hidden="true" /> Try again
      </Button>
    </div>
  )
}
