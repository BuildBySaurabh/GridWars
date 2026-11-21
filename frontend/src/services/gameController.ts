/**
 * Game controller: every side effect (REST calls, the WebSocket, storage,
 * toasts) lives here, not in React components. Components read the store and
 * call these methods.
 *
 * Correctness rules:
 *  - Ownership only ever changes from server data (REST response / event /
 *    snapshot) through the version-guarded `applyCell`. A click merely marks the
 *    cell "pending"; nothing is assumed until the server answers.
 *  - A snapshot is refetched on EVERY `connection.ready` — including the first —
 *    so captures that happened while the socket was down (or between the first
 *    fetch and socket authentication) are recovered.
 */
import { ApiError } from '../api/client'
import * as endpoints from '../api/endpoints'
import type { Cell, ServerEvent } from '../api/types'
import { setTokenProvider } from '../api/client'
import { config } from '../config'
import { coordLabel } from '../lib/grid'
import { GridSocket, type SocketHandle, type SocketOptions } from '../realtime/socket'
import { useGameStore } from '../store/gameStore'
import { useToastStore } from '../store/toastStore'
import { clearSession, loadSession, saveSession, sessionFromJoin } from './session'

export interface ControllerDeps {
  api: Pick<typeof endpoints, 'join' | 'getMe' | 'getGrid' | 'capture'>
  createSocket: (options: SocketOptions) => SocketHandle
  storage: { load: typeof loadSession; save: typeof saveSession; clear: typeof clearSession }
  wsUrl: string
  conflictFlashMs?: number
}

const game = () => useGameStore.getState()
const toast = (kind: 'success' | 'error' | 'info', message: string) => useToastStore.getState().push(kind, message)

export function createController(deps: ControllerDeps) {
  let socket: SocketHandle | null = null
  const flashTimers = new Map<number, ReturnType<typeof setTimeout>>()

  setTokenProvider(() => game().session?.token ?? null)

  // --------------------------------------------------------------- realtime
  function handleEvent(event: ServerEvent): void {
    switch (event.type) {
      case 'connection.ready':
        game().setOnlinePlayers(event.data.online_players)
        void refreshSnapshot().catch(() => toast('error', 'Could not refresh the grid. Retrying on next reconnect.'))
        break
      case 'cell.captured': {
        const { cell_id, row, column, owner, captured_at, version } = event.data
        game().applyCell({ id: cell_id, row, column, owner, captured_at, version })
        break
      }
      case 'presence.updated':
      case 'pong':
        game().setOnlinePlayers(event.data.online_players)
        break
      case 'leaderboard.updated':
        // The web client derives the leaderboard from the version-guarded grid,
        // so it cannot go stale; the event remains for clients without the grid.
        break
      case 'error':
        console.warn(`GridWars: server error ${event.data.code}: ${event.data.message}`)
        break
    }
  }

  function startRealtime(): void {
    if (socket) return
    socket = deps.createSocket({
      url: deps.wsUrl,
      getToken: () => game().session?.token ?? null,
      onEvent: handleEvent,
      onStatus: (status) => game().setConnection(status),
      onAuthFailed: () => logout('Your session is no longer valid. Please join again.'),
    })
    socket.start()
  }

  function stopRealtime(): void {
    socket?.stop()
    socket = null
  }

  // ------------------------------------------------------------------ data
  async function refreshSnapshot(): Promise<void> {
    const snapshot = await deps.api.getGrid()
    game().applySnapshot(snapshot.cells)
  }

  async function enterGame(): Promise<void> {
    game().setPhase('loading')
    try {
      await refreshSnapshot()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        logout('Your session expired. Please join again.')
        return
      }
      game().setPhase('error', error instanceof ApiError ? error.message : 'Could not load the grid.')
      return
    }
    game().setPhase('ready')
    startRealtime()
  }

  // --------------------------------------------------------------- lifecycle
  async function bootstrap(): Promise<void> {
    const session = deps.storage.load()
    if (!session) {
      game().setPhase('welcome')
      return
    }
    game().setSession(session)
    try {
      await deps.api.getMe() // is the stored token still accepted?
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        deps.storage.clear()
        game().setSession(null)
        game().setPhase('welcome')
        toast('info', 'Your previous session expired. Join again to keep playing.')
        return
      }
      // Server unreachable: fall through; enterGame will surface a retryable error.
    }
    await enterGame()
  }

  /** Throws ApiError so the welcome form can show field-level messages. */
  async function join(username: string, color: string): Promise<void> {
    const response = await deps.api.join(username.trim(), color)
    const session = sessionFromJoin(response)
    deps.storage.save(session)
    game().setSession(session)
    await enterGame()
  }

  function logout(message?: string): void {
    stopRealtime()
    flashTimers.forEach((timer) => clearTimeout(timer))
    flashTimers.clear()
    deps.storage.clear()
    game().reset()
    game().setPhase('welcome')
    if (message) toast('info', message)
  }

  // ----------------------------------------------------------------- capture
  function flashConflict(cellId: number): void {
    game().setConflict(cellId, true)
    clearTimeout(flashTimers.get(cellId))
    flashTimers.set(
      cellId,
      setTimeout(() => {
        game().setConflict(cellId, false)
        flashTimers.delete(cellId)
      }, deps.conflictFlashMs ?? 900),
    )
  }

  function conflictedCell(error: ApiError): Cell | null {
    const cell = error.details.cell
    if (typeof cell !== 'object' || cell === null) return null
    const c = cell as Partial<Cell>
    return typeof c.id === 'number' && typeof c.version === 'number' ? (cell as Cell) : null
  }

  async function captureCell(cellId: number): Promise<void> {
    const { session, pending, cells } = game()
    if (!session || pending[cellId]) return
    const known = cells[cellId - 1]
    if (known?.owner) return // already owned: no request, no state change

    game().setPending(cellId, true)
    try {
      const cell = await deps.api.capture(cellId)
      game().applyCell(cell)
      toast('success', `Captured ${coordLabel(cell.row, cell.column)}!`)
    } catch (error) {
      if (!(error instanceof ApiError)) {
        toast('error', 'Something went wrong. Please try again.')
        return
      }
      switch (true) {
        case error.status === 409: {
          const cell = conflictedCell(error)
          if (cell) game().applyCell(cell)
          const label = cell ? coordLabel(cell.row, cell.column) : 'That cell'
          if (cell?.owner?.id === session.player.id) {
            toast('info', `You already own ${label}.`)
          } else {
            flashConflict(cellId)
            toast('error', cell?.owner ? `Too slow! ${cell.owner.username} captured ${label} first.` : `${label} was already captured.`)
          }
          break
        }
        case error.status === 401:
          logout('Your session expired. Please join again.')
          break
        case error.status === 429:
          toast('error', 'Slow down a little — too many capture attempts.')
          break
        case error.isNetworkError:
          // The request may or may not have reached the server: re-sync to find out.
          toast('error', 'Connection problem — capture not confirmed. Re-checking the grid…')
          void refreshSnapshot().catch(() => undefined)
          break
        default:
          toast('error', error.message)
      }
    } finally {
      game().setPending(cellId, false)
    }
  }

  return { bootstrap, join, logout, captureCell, retry: enterGame, refreshSnapshot }
}

export type GameController = ReturnType<typeof createController>

export const controller: GameController = createController({
  api: endpoints,
  createSocket: (options) => new GridSocket(options),
  storage: { load: loadSession, save: saveSession, clear: clearSession },
  wsUrl: config.wsUrl,
})
