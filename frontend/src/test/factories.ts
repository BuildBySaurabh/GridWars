import type { Cell, Player } from '../api/types'
import { GRID_SIZE } from '../lib/grid'

export const ME: Player = { id: 'me-id', username: 'Neo', color: '#22D3EE' }
export const RIVAL: Player = { id: 'rival-id', username: 'Trinity', color: '#F472B6' }

export function makeCell(id: number, overrides: Partial<Cell> = {}): Cell {
  return {
    id,
    row: Math.floor((id - 1) / GRID_SIZE),
    column: (id - 1) % GRID_SIZE,
    owner: null,
    captured_at: null,
    version: 1,
    ...overrides,
  }
}

export function ownedCell(id: number, owner: Player, version = 2, capturedAt = '2026-11-16T12:00:00Z'): Cell {
  return makeCell(id, { owner, version, captured_at: capturedAt })
}

/** A full 625-cell snapshot, all unclaimed at version 1, with optional owned overrides. */
export function makeSnapshot(owned: Cell[] = []): Cell[] {
  const byId = new Map(owned.map((cell) => [cell.id, cell]))
  return Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => byId.get(i + 1) ?? makeCell(i + 1))
}
