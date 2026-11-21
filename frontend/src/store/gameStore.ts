import { create } from 'zustand'

import type { Cell, Player } from '../api/types'
import { placeholderCells } from '../lib/grid'
import type { ConnectionStatus } from '../realtime/socket'
import type { Session } from '../services/session'

/** booting: reading storage · welcome: not joined · loading: first snapshot · ready · error: snapshot failed */
export type Phase = 'booting' | 'welcome' | 'loading' | 'ready' | 'error'

export interface ActivityItem {
  /** `${cellId}:${version}` — unique per change, so duplicates are dropped. */
  id: string
  cellId: number
  row: number
  column: number
  owner: Player
  capturedAt: string
}

const MAX_ACTIVITY = 15

interface GameState {
  phase: Phase
  loadError: string | null
  session: Session | null
  /** Index = cell id - 1. */
  cells: Cell[]
  hasSnapshot: boolean
  /** Cells with a capture request in flight (visual feedback only; never ownership). */
  pending: Record<number, true>
  /** Cells that were just lost to another player. */
  conflicts: Record<number, true>
  connection: ConnectionStatus
  onlinePlayers: number
  activity: ActivityItem[]

  setPhase: (phase: Phase, loadError?: string | null) => void
  setSession: (session: Session | null) => void
  /**
   * Apply one cell from the server (REST response or WebSocket event).
   * Ignored — returns false — unless its version is strictly newer than ours,
   * which makes duplicate delivery and out-of-order events harmless.
   */
  applyCell: (cell: Cell) => boolean
  /** Merge a full snapshot, never replacing a cell with an older version. */
  applySnapshot: (cells: Cell[]) => void
  setPending: (cellId: number, pending: boolean) => void
  setConflict: (cellId: number, conflict: boolean) => void
  setConnection: (status: ConnectionStatus) => void
  setOnlinePlayers: (count: number) => void
  reset: () => void
}

function initialState() {
  return {
    phase: 'booting' as Phase,
    loadError: null as string | null,
    session: null as Session | null,
    cells: placeholderCells(),
    hasSnapshot: false,
    pending: {} as Record<number, true>,
    conflicts: {} as Record<number, true>,
    connection: 'disconnected' as ConnectionStatus,
    onlinePlayers: 0,
    activity: [] as ActivityItem[],
  }
}

export const useGameStore = create<GameState>()((set, get) => ({
  ...initialState(),

  setPhase: (phase, loadError = null) => set({ phase, loadError }),
  setSession: (session) => set({ session }),

  applyCell: (cell) => {
    const { cells, hasSnapshot, activity } = get()
    const current = cells[cell.id - 1]
    if (!current || cell.version <= current.version) return false

    const next = cells.slice()
    next[cell.id - 1] = cell
    const update: Partial<GameState> = { cells: next }

    if (hasSnapshot && cell.owner && cell.captured_at) {
      const id = `${cell.id}:${cell.version}`
      if (!activity.some((item) => item.id === id)) {
        update.activity = [
          { id, cellId: cell.id, row: cell.row, column: cell.column, owner: cell.owner, capturedAt: cell.captured_at },
          ...activity,
        ].slice(0, MAX_ACTIVITY)
      }
    }
    set(update)
    return true
  },

  applySnapshot: (incoming) => {
    const byId = new Map(incoming.map((cell) => [cell.id, cell]))
    set((state) => ({
      hasSnapshot: true,
      cells: state.cells.map((local) => {
        const remote = byId.get(local.id)
        return remote && remote.version >= local.version ? remote : local
      }),
    }))
  },

  setPending: (cellId, pending) =>
    set((state) => {
      if (pending === (state.pending[cellId] === true)) return state
      const next = { ...state.pending }
      if (pending) next[cellId] = true
      else delete next[cellId]
      return { pending: next }
    }),

  setConflict: (cellId, conflict) =>
    set((state) => {
      if (conflict === (state.conflicts[cellId] === true)) return state
      const next = { ...state.conflicts }
      if (conflict) next[cellId] = true
      else delete next[cellId]
      return { conflicts: next }
    }),

  setConnection: (connection) => set({ connection }),
  setOnlinePlayers: (onlinePlayers) => set({ onlinePlayers }),
  reset: () => set(initialState()),
}))
