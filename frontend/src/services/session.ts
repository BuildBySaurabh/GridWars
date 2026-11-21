import type { JoinResponse, Player } from '../api/types'

/**
 * The guest session (JWT + player). Stored in localStorage so a refresh keeps
 * the player signed in. Trade-off: readable by any script running on the page
 * (XSS); acceptable for a PII-free guest game, and documented in the README.
 * Every storage call is guarded: storage can be blocked or full.
 */
const KEY = 'gridwars.session'

export interface Session {
  token: string
  player: Player
  /** Epoch milliseconds. */
  expiresAt: number
}

function isPlayer(value: unknown): value is Player {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'string' && typeof v.username === 'string' && typeof v.color === 'string'
}

export function sessionFromJoin(response: JoinResponse, now: number = Date.now()): Session {
  return { token: response.token, player: response.player, expiresAt: now + response.expires_in * 1000 }
}

export function loadSession(now: number = Date.now()): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const v = parsed as Record<string, unknown>
    if (typeof v.token !== 'string' || typeof v.expiresAt !== 'number' || !isPlayer(v.player)) return null
    if (v.expiresAt <= now) {
      clearSession()
      return null
    }
    return { token: v.token, player: v.player, expiresAt: v.expiresAt }
  } catch {
    return null
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    /* storage unavailable: the session simply won't survive a refresh */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
