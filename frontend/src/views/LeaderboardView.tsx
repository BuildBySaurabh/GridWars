import { Leaderboard } from '../components/Leaderboard'
import { PlayerPanel } from '../components/PlayerPanel'

export function LeaderboardView() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <Leaderboard limit={50} showPercent />
      <div className="content-start">
        <PlayerPanel />
      </div>
    </div>
  )
}
