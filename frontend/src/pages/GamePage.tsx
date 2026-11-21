import { ConnectionBanner } from '../components/ConnectionBanner'
import { ErrorState } from '../components/ErrorState'
import { MobileNav } from '../components/layout/MobileNav'
import { SideNav } from '../components/layout/SideNav'
import { NAV_ITEMS } from '../components/layout/nav'
import { TopNav } from '../components/TopNav'
import { controller } from '../services/gameController'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import { HomeView } from '../views/HomeView'
import { LeaderboardView } from '../views/LeaderboardView'
import { PlayView } from '../views/PlayView'
import { ProfileView } from '../views/ProfileView'
import { SettingsView } from '../views/SettingsView'

const VIEWS = {
  home: HomeView,
  play: PlayView,
  leaderboard: LeaderboardView,
  profile: ProfileView,
  settings: SettingsView,
}

export function GamePage() {
  const phase = useGameStore((state) => state.phase)
  const loadError = useGameStore((state) => state.loadError)
  const view = useUiStore((state) => state.view)
  const View = VIEWS[view]
  const title = NAV_ITEMS.find((item) => item.view === view)?.label ?? 'Play'

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main')?.focus()
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2 focus:text-base"
      >
        Skip to content
      </a>
      <TopNav />
      <div className="flex">
        <SideNav />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-3 py-4 outline-none sm:px-5">
          <h1 className="sr-only">GridWars: shared real-time grid</h1>
          <p className="mb-3 font-display text-lg font-semibold" aria-hidden="true">{title}</p>
          {phase === 'ready' ? <ConnectionBanner /> : null}
          {phase === 'error' ? (
            <ErrorState
              title="Couldn't load the grid"
              message={loadError ?? 'Something went wrong while loading the board.'}
              onRetry={() => void controller.retry()}
            />
          ) : (
            <View />
          )}
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
