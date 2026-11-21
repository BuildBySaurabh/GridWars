import { Loader2, WifiOff } from 'lucide-react'

import { useGameStore } from '../store/gameStore'

/** Shown on every view while the live connection is down. */
export function ConnectionBanner() {
  const connection = useGameStore((state) => state.connection)
  if (connection === 'connected' || connection === 'connecting') return null
  const offline = connection === 'disconnected'
  return (
    <div role="status" className="mb-3 flex items-center gap-2.5 rounded-xl border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm text-warn">
      {offline ? <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />}
      <span>
        {offline ? 'You are offline.' : 'Connection lost — reconnecting…'} The grid may be out of date and will refresh
        automatically when you're back.
      </span>
    </div>
  )
}
