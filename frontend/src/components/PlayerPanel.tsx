import { BarChart3 } from 'lucide-react'

import { formatPercent } from '../lib/format'
import { TOTAL_CELLS } from '../lib/grid'
import { useGameStore } from '../store/gameStore'
import { useGridStats } from '../store/selectors'
import { Avatar } from './ui/Avatar'
import { Panel } from './ui/Panel'
import { StatTile } from './ui/StatTile'

export function PlayerPanelSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-panel p-4" aria-busy="true" aria-label="Loading your stats">
      <div className="skeleton h-6 w-2/3" />
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20" />
        ))}
      </div>
    </div>
  )
}

export function PlayerPanel({ showIdentity = true }: { showIdentity?: boolean }) {
  const player = useGameStore((state) => state.session?.player)
  const hasSnapshot = useGameStore((state) => state.hasSnapshot)
  const stats = useGridStats()
  if (!hasSnapshot || !player) return <PlayerPanelSkeleton />

  const claimedShare = (stats.captured / TOTAL_CELLS) * 100

  return (
    <Panel title="Your statistics" icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />} aria-label="Your statistics">
      {showIdentity ? (
        <div className="mb-3 flex items-center gap-3">
          <Avatar name={player.username} color={player.color} size={36} />
          <div className="min-w-0">
            <p className="truncate font-display text-base leading-tight font-semibold">{player.username}</p>
            <p className="font-mono text-xs text-muted">{player.color}</p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Your cells" value={String(stats.mine)} />
        <StatTile label="Territory" value={formatPercent(stats.minePercentage)} hint={`of ${TOTAL_CELLS} cells`} />
        <StatTile label="Rank" value={stats.rank ? `#${stats.rank}` : '—'} hint={stats.rank ? undefined : 'Capture a cell'} />
        <StatTile label="Unclaimed" value={String(stats.unclaimed)} hint="cells remaining" />
      </div>

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>Grid claimed</span>
          <span className="tabular-nums">
            {stats.captured} / {TOTAL_CELLS}
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-white/8"
          role="progressbar"
          aria-label="Share of the grid that has been claimed"
          aria-valuemin={0}
          aria-valuemax={TOTAL_CELLS}
          aria-valuenow={stats.captured}
        >
          <div
            className="h-full rounded-full bg-linear-to-r from-brand to-accent transition-[width] duration-500"
            style={{ width: `${claimedShare}%` }}
          />
        </div>
      </div>
    </Panel>
  )
}
