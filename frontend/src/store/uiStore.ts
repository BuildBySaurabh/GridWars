import { create } from 'zustand'

export type View = 'home' | 'play' | 'leaderboard' | 'profile' | 'settings'
export const VIEWS: readonly View[] = ['home', 'play', 'leaderboard', 'profile', 'settings']
const SETTINGS_KEY = 'gridwars.settings'

export interface Settings {
  showCoordinates: boolean
  reduceMotion: boolean
}
const DEFAULT_SETTINGS: Settings = { showCoordinates: true, reduceMotion: false }

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      showCoordinates: typeof parsed.showCoordinates === 'boolean' ? parsed.showCoordinates : true,
      reduceMotion: typeof parsed.reduceMotion === 'boolean' ? parsed.reduceMotion : false,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function viewFromHash(hash: string): View {
  const name = hash.replace(/^#\/?/, '')
  return (VIEWS as readonly string[]).includes(name) ? (name as View) : 'play'
}

function applyMotion(reduce: boolean) {
  if (typeof document === 'undefined') return
  if (reduce) document.documentElement.dataset.motion = 'reduced'
  else delete document.documentElement.dataset.motion
}

interface UiState {
  view: View
  navOpen: boolean
  settings: Settings
  setView: (view: View) => void
  setNavOpen: (open: boolean) => void
  updateSettings: (patch: Partial<Settings>) => void
}

/** UI-only state: which view is showing, the mobile drawer, local preferences. Never game data. */
export const useUiStore = create<UiState>()((set, get) => ({
  view: typeof location === 'undefined' ? 'play' : viewFromHash(location.hash),
  navOpen: false,
  settings: readSettings(),
  setView: (view) => {
    if (typeof location !== 'undefined' && viewFromHash(location.hash) !== view) location.hash = `/${view}`
    set({ view, navOpen: false })
  },
  setNavOpen: (navOpen) => set({ navOpen }),
  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      /* storage unavailable: the setting still applies for this visit */
    }
    applyMotion(settings.reduceMotion)
    set({ settings })
  },
}))

/** Call once at startup: apply saved motion setting and follow the back/forward buttons. */
export function initUi(): () => void {
  applyMotion(useUiStore.getState().settings.reduceMotion)
  const onHash = () => useUiStore.setState({ view: viewFromHash(location.hash), navOpen: false })
  window.addEventListener('hashchange', onHash)
  return () => window.removeEventListener('hashchange', onHash)
}
