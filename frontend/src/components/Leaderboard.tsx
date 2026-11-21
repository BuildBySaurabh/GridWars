import { Crown, Trophy } from 'lucide-react'

import { useChangeFlash } from '../lib/useChangeFlash'
import { useGameStore } from '../store/gameStore'
import { useGridStats, useLeaderboard, type LeaderboardRow } from '../store/selectors'
import { Avatar } from './ui/Avatar'
import { EmptyState } from './ui/EmptyState'
import { Panel } from './ui/Panel'

const RANK_TONE: Record<number, string> = {
  1: 'bg-warn/20 text-warn',
  2: 'bg-slate-300/15 text-slate-200',
  3: 'bg-orange-400/15 text-orange-300',
}

function Row({ rank, name, color, count, isMe, percentage }: {
  rank: number
  name: string
  color: string
  count: number
  isMe: boolean
  percentage?: number
}) {
  const flash = useChangeFlash(count)
  return (
    <li
      className={`row-enter flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-sm transition-colors ${
        isMe ? 'border-brand/40 bg-brand/8' : 'border-line/70 bg-surface/60'
      }`}
    >
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg text-xs font-bold tabular-nums ${RANK_TONE[rank] ?? 'bg-white/6 text-muted'}`}
      >
        {rank === 1 ? <Crown className="h-3.5 w-3.5" aria-label="Rank 1" /> : rank}
      </span>
      <Avatar name={name} color={color} size={22} />
      <span className="min-w-0 flex-1 truncate font-medium">
        {name}
        {isMe ? <span className="ml-1.5 text-xs font-normal text-brand">you</span> : null}
      </span>
      {percentage !== undefined ? <span className="hidden text-xs text-muted tabular-nums sm:inline">{percentage}%</span> : null}
      <span className={`font-semibold tabular-nums ${flash ? 'flash-up' : ''}`}>{count}</span>
    </li>
  )
}

function toRow(row: LeaderboardRow, myId: string | undefined, showPercent: boolean) {
  return (
    <Row
      key={row.player.id}
      rank={row.rank}
      name={row.player.username}
      color={row.player.color}
      count={row.count}
      isMe={row.player.id === myId}
      percentage={showPercent ? row.percentage : undefined}
    />
  )
}

export function Leaderboard({ limit = 10, showPercent = false }: { limit?: number; showPercent?: boolean }) {
  const hasSnapshot = useGameStore((state) => state.hasSnapshot)
  const me = useGameStore((state) => state.session?.player)
  const rows = useLeaderboard(limit)
  const stats = useGridStats()
  const meInTop = rows.some((row) => row.player.id === me?.id)

  return (
    <Panel title="Leaderboard" icon={<Trophy className="h-4 w-4" aria-hidden="true" />} aria-label="Leaderboard">
      {!hasSnapshot ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-10" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Trophy className="h-6 w-6" aria-hidden="true" />}>No captures yet. Be the first to claim a cell!</EmptyState>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((row) => toRow(row, me?.id, showPercent))}
          {me && !meInTop && stats.mine > 0 && stats.rank ? (
            <>
              <li aria-hidden="true" className="text-center text-xs leading-none text-muted">⋯</li>
              <Row rank={stats.rank} name={me.username} color={me.color} count={stats.mine} isMe percentage={showPercent ? stats.minePercentage : undefined} />
            </>
          ) : null}
        </ol>
      )}
    </Panel>
  )
}
