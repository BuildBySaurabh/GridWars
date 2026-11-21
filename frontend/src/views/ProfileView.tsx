import { LogOut } from 'lucide-react'
import { useState } from 'react'

import { PlayerPanel } from '../components/PlayerPanel'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { Panel } from '../components/ui/Panel'
import { controller } from '../services/gameController'
import { useGameStore } from '../store/gameStore'

export function ProfileView() {
  const session = useGameStore((state) => state.session)
  const [confirming, setConfirming] = useState(false)
  if (!session) return null
  const { player, expiresAt } = session

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Panel>
          <div className="flex items-center gap-4">
            <Avatar name={player.username} color={player.color} size={56} />
            <div className="min-w-0">
              <h2 className="truncate font-display text-xl font-semibold">{player.username}</h2>
              <p className="flex items-center gap-2 font-mono text-xs text-muted">
                <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: player.color }} aria-hidden="true" />
                {player.color.toUpperCase()}
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted">
            Guest session valid until {new Date(expiresAt).toLocaleString()}. Your name and color are fixed once you join.
          </p>
        </Panel>

        <Panel title="Leave the game">
          {confirming ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                This ends your guest session. Your captured cells stay on the grid, but you won't be able to reclaim this name.
              </p>
              <div className="flex gap-2">
                <Button onClick={() => setConfirming(false)}>Cancel</Button>
                <Button variant="danger" onClick={() => controller.logout('You left the grid.')}>
                  Leave
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              <LogOut className="h-4 w-4" aria-hidden="true" /> Leave game
            </Button>
          )}
        </Panel>
      </div>
      <PlayerPanel showIdentity={false} />
    </div>
  )
}
