import { Activity } from 'lucide-react'

import { relativeTime } from '../lib/format'
import { coordLabel } from '../lib/grid'
import { useNow } from '../lib/useNow'
import { useGameStore } from '../store/gameStore'
import { EmptyState } from './ui/EmptyState'
import { Panel } from './ui/Panel'

export function ActivityFeed({ maxHeight = 'max-h-64' }: { maxHeight?: string }) {
  const items = useGameStore((state) => state.activity)
  const hasSnapshot = useGameStore((state) => state.hasSnapshot)
  const myId = useGameStore((state) => state.session?.player.id)
  const now = useNow()

  return (
    <Panel title="Recent activity" icon={<Activity className="h-4 w-4" aria-hidden="true" />} aria-label="Recent activity">
      {!hasSnapshot ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-6" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState>Waiting for the next capture…</EmptyState>
      ) : (
        <ul className={`${maxHeight} space-y-1.5 overflow-y-auto pr-1`}>
          {items.map((item) => (
            <li key={item.id} className="row-enter flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.owner.color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{item.owner.id === myId ? 'You' : item.owner.username}</span>{' '}
                <span className="text-muted">captured</span>{' '}
                <span className="rounded bg-brand/10 px-1 font-mono text-xs text-brand">{coordLabel(item.row, item.column)}</span>
              </span>
              <time dateTime={item.capturedAt} className="shrink-0 text-xs text-muted">
                {relativeTime(item.capturedAt, now)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
