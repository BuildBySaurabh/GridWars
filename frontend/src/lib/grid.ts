import type { Cell } from '../api/types'

export const GRID_SIZE = 25
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE

export const CELL_IDS: readonly number[] = Array.from({ length: TOTAL_CELLS }, (_, index) => index + 1)
export const INDEXES: readonly number[] = Array.from({ length: GRID_SIZE }, (_, index) => index)

const COLUMN_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXY'

export function columnLetter(column: number): string {
  return COLUMN_LETTERS[column] ?? '?'
}

/** Battleship-style label for a zero-based coordinate: row 4, column 19 -> "T5". */
export function coordLabel(row: number, column: number): string {
  return `${columnLetter(column)}${row + 1}`
}

/**
 * Version-0 placeholders. They are "unknown" rather than "unclaimed": any real
 * server state (version >= 1) replaces them, and the UI shows a skeleton until
 * the first snapshot has arrived.
 */
export function placeholderCells(): Cell[] {
  return CELL_IDS.map((id) => ({
    id,
    row: Math.floor((id - 1) / GRID_SIZE),
    column: (id - 1) % GRID_SIZE,
    owner: null,
    captured_at: null,
    version: 0,
  }))
}
