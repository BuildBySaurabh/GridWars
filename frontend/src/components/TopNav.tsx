import { Menu, Settings, Users } from 'lucide-react'

import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import { ConnectionBadge } from './ConnectionBadge'
import { Logo } from './Logo'
import { Avatar } from './ui/Avatar'

export function TopNav() {
  const online = useGameStore((state) => state.onlinePlayers)
  const connection = useGameStore((state) => state.connection)
  const player = useGameStore((state) => state.session?.player)
  const setView = useUiStore((state) => state.setView)
  const setNavOpen = useUiStore((state) => state.setNavOpen)

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-line bg-night/85 backdrop-blur">
      <div className="flex h-full items-center justify-between gap-2 px-3 sm:px-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="grid h-10 w-10 cursor-pointer place-items-center rounded-xl text-muted hover:bg-white/5 hover:text-fg lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <Logo />
        </div>
        <div className="flex items-center gap-2">
          <div
            className="hidden h-8 items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 text-xs font-medium sm:flex"
            title="Players online right now"
          >
            <Users className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
            <span aria-label={`${online} players online`}>{connection === 'connected' ? online : '–'} online</span>
          </div>
          <ConnectionBadge />
          {player ? (
            <button
              type="button"
              onClick={() => setView('profile')}
              aria-label={`Profile: ${player.username}`}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line bg-panel py-1 pr-3 pl-1 text-sm transition hover:border-brand/50"
            >
              <Avatar name={player.username} color={player.color} size={30} />
              <span className="hidden max-w-[8rem] truncate font-medium sm:inline">{player.username}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setView('settings')}
            aria-label="Settings"
            className="grid h-10 w-10 cursor-pointer place-items-center rounded-xl text-muted transition hover:bg-white/5 hover:text-fg"
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  )
}
