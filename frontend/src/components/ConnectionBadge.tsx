import { Loader2, WifiOff } from 'lucide-react'

import type { ConnectionStatus } from '../realtime/socket'
import { useGameStore } from '../store/gameStore'

const LABELS: Record<ConnectionStatus, string> = {
  connected: 'Live',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  disconnected: 'Offline',
}

export function ConnectionBadge() {
  const status = useGameStore((state) => state.connection)
  const live = status === 'connected'
  const busy = status === 'connecting' || status === 'reconnecting'
  const tone = live
    ? 'border-ok/30 bg-ok/10 text-ok'
    : busy
      ? 'border-warn/30 bg-warn/10 text-warn'
      : 'border-bad/30 bg-bad/10 text-bad'

  return (
    <div
      role="status"
      aria-label={`Connection status: ${LABELS[status]}`}
      className={`flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${tone}`}
    >
      {live ? (
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
        </span>
      ) : busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span>{LABELS[status]}</span>
    </div>
  )
}
