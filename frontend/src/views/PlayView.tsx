import { ActivityFeed } from '../components/ActivityFeed'
import { GridBoard, GridSkeleton } from '../components/GridBoard'
import { Leaderboard } from '../components/Leaderboard'
import { PlayerPanel } from '../components/PlayerPanel'
import { useGameStore } from '../store/gameStore'

export function PlayView() {
  const phase = useGameStore((state) => state.phase)
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0">{phase === 'ready' ? <GridBoard /> : <GridSkeleton />}</div>
      <aside className="grid min-w-0 content-start gap-4 md:grid-cols-2 xl:grid-cols-1" aria-label="Player information">
        <PlayerPanel />
        <Leaderboard />
        <div className="md:col-span-2 xl:col-span-1">
          <ActivityFeed />
        </div>
      </aside>
    </div>
  )
}
