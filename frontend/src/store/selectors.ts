import { useMemo } from 'react'

import type { Cell, Player } from '../api/types'
import { TOTAL_CELLS } from '../lib/grid'
import { useGameStore } from './gameStore'

export interface LeaderboardRow {
  rank: number
  player: Player
  count: number
  percentage: number
}

export interface GridStats {
  captured: number
  unclaimed: number
  mine: number
  minePercentage: number
  /** 1-based; ties share a rank; null until the player owns a cell. */
  rank: number | null
}

const percentage = (count: number) => Math.round((count * 10000) / TOTAL_CELLS) / 100

/**
 * The leaderboard is derived from the grid itself. The grid is version-guarded,
 * so the leaderboard can never disagree with it or move backwards on an
 * out-of-order event. Ordering mirrors the server: most cells, then earliest
 * first capture, then name; equal counts share a rank.
 */
export function computeLeaderboard(cells: readonly Cell[], limit = 10): LeaderboardRow[] {
  const byPlayer = new Map<string, { player: Player; count: number; first: string }>()
  for (const cell of cells) {
    if (!cell.owner || !cell.captured_at) continue
    const entry = byPlayer.get(cell.owner.id)
    if (entry) {
      entry.count += 1
      if (cell.captured_at < entry.first) entry.first = cell.captured_at
    } else {
      byPlayer.set(cell.owner.id, { player: cell.owner, count: 1, first: cell.captured_at })
    }
  }
  const sorted = [...byPlayer.values()].sort(
    (a, b) => b.count - a.count || a.first.localeCompare(b.first) || a.player.username.localeCompare(b.player.username),
  )
  let previous = -1
  let rank = 0
  return sorted.slice(0, limit).map((entry, index) => {
    if (entry.count !== previous) {
      rank = index + 1
      previous = entry.count
    }
    return { rank, player: entry.player, count: entry.count, percentage: percentage(entry.count) }
  })
}

export function computeStats(cells: readonly Cell[], myId: string | undefined): GridStats {
  const counts = new Map<string, number>()
  let captured = 0
  for (const cell of cells) {
    if (!cell.owner) continue
    captured += 1
    counts.set(cell.owner.id, (counts.get(cell.owner.id) ?? 0) + 1)
  }
  const mine = myId ? (counts.get(myId) ?? 0) : 0
  let rank: number | null = null
  if (mine > 0) {
    let ahead = 0
    for (const count of counts.values()) if (count > mine) ahead += 1
    rank = ahead + 1
  }
  return { captured, unclaimed: TOTAL_CELLS - captured, mine, minePercentage: percentage(mine), rank }
}

export function useGridStats(): GridStats {
  const cells = useGameStore((state) => state.cells)
  const myId = useGameStore((state) => state.session?.player.id)
  return useMemo(() => computeStats(cells, myId), [cells, myId])
}

export function useLeaderboard(limit = 10): LeaderboardRow[] {
  const cells = useGameStore((state) => state.cells)
  return useMemo(() => computeLeaderboard(cells, limit), [cells, limit])
}
