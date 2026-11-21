import { Gamepad2, Users } from 'lucide-react'

import { ActivityFeed } from '../components/ActivityFeed'
import { Leaderboard } from '../components/Leaderboard'
import { PlayerPanel } from '../components/PlayerPanel'
import { Button } from '../components/ui/Button'
import { Panel } from '../components/ui/Panel'
import { TOTAL_CELLS } from '../lib/grid'
import { useGameStore } from '../store/gameStore'
import { useGridStats } from '../store/selectors'
import { useUiStore } from '../store/uiStore'

export function HomeView() {
  const player = useGameStore((state) => state.session?.player)
  const hasSnapshot = useGameStore((state) => state.hasSnapshot)
  const online = useGameStore((state) => state.onlinePlayers)
  const connection = useGameStore((state) => state.connection)
  const stats = useGridStats()
  const setView = useUiStore((state) => state.setView)

  return (
    <div className="space-y-4">
      <Panel className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Welcome back, <span className="text-brand">{player?.username}</span>
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted">
              {hasSnapshot
                ? `${stats.captured} of ${TOTAL_CELLS} cells are claimed and ${stats.unclaimed} are still up for grabs.`
                : 'Loading the board…'}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <Users className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
              {connection === 'connected' ? `${online} online now` : 'Players online: unavailable while disconnected'}
            </p>
          </div>
          <Button variant="primary" size="lg" onClick={() => setView('play')}>
            <Gamepad2 className="h-5 w-5" aria-hidden="true" /> Play now
          </Button>
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-3">
        <PlayerPanel showIdentity={false} />
        <Leaderboard limit={5} />
        <ActivityFeed />
      </div>
    </div>
  )
}
