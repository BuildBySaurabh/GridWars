import { useGameStore } from '../store/gameStore'
import { computeLeaderboard, computeStats } from '../store/selectors'
import { ME, RIVAL, makeCell, makeSnapshot, ownedCell } from './factories'

const state = () => useGameStore.getState()

beforeEach(() => state().reset())

describe('game store: version-guarded state', () => {
  it('starts with 625 unknown (version 0) cells and no snapshot', () => {
    expect(state().cells).toHaveLength(625)
    expect(state().hasSnapshot).toBe(false)
    expect(state().cells.every((c) => c.version === 0 && c.owner === null)).toBe(true)
  })

  it('applies a newer version and ignores equal or older ones (duplicates / stale events)', () => {
    state().applySnapshot(makeSnapshot())
    expect(state().applyCell(ownedCell(10, RIVAL, 2))).toBe(true)
    expect(state().cells[9]!.owner?.username).toBe('Trinity')

    expect(state().applyCell(ownedCell(10, RIVAL, 2))).toBe(false) // duplicate delivery
    expect(state().applyCell(ownedCell(10, ME, 2))).toBe(false) // same version, different owner: rejected
    expect(state().applyCell(makeCell(10, { version: 1 }))).toBe(false) // stale "unclaimed" event
    expect(state().cells[9]!.owner?.id).toBe(RIVAL.id)
  })

  it('does not replace the cell object when an update is ignored (no needless re-render)', () => {
    state().applySnapshot(makeSnapshot([ownedCell(5, RIVAL)]))
    const before = state().cells
    state().applyCell(ownedCell(5, RIVAL, 2))
    expect(state().cells).toBe(before)
  })

  it('a snapshot never overwrites a newer cell received while it was in flight', () => {
    state().applySnapshot(makeSnapshot())
    state().applyCell(ownedCell(7, RIVAL, 2)) // event arrived first
    state().applySnapshot(makeSnapshot()) // older snapshot (cell 7 still unclaimed, v1) lands late
    expect(state().cells[6]!.owner?.id).toBe(RIVAL.id)
  })

  it('a snapshot recovers captures that were missed while disconnected', () => {
    state().applySnapshot(makeSnapshot())
    state().applySnapshot(makeSnapshot([ownedCell(1, RIVAL), ownedCell(2, ME, 3)]))
    expect(state().cells[0]!.owner?.id).toBe(RIVAL.id)
    expect(state().cells[1]!.version).toBe(3)
  })

  it('records activity only for live changes, deduplicated, newest first, capped', () => {
    state().applySnapshot(makeSnapshot([ownedCell(1, RIVAL)]))
    expect(state().activity).toHaveLength(0) // the snapshot itself is not "activity"

    state().applyCell(ownedCell(2, ME, 2))
    state().applyCell(ownedCell(2, ME, 2)) // duplicate
    expect(state().activity.map((a) => a.cellId)).toEqual([2])

    for (let id = 3; id < 30; id++) state().applyCell(ownedCell(id, RIVAL, 2))
    expect(state().activity).toHaveLength(15)
    expect(state().activity[0]!.cellId).toBe(29)
  })

  it('does not announce changes that arrive before the first snapshot', () => {
    state().applyCell(ownedCell(3, RIVAL, 2))
    expect(state().activity).toHaveLength(0)
    expect(state().cells[2]!.owner?.id).toBe(RIVAL.id) // but the state is kept
  })

  it('tracks pending and conflict flags immutably', () => {
    state().setPending(4, true)
    expect(state().pending).toEqual({ 4: true })
    const before = state().pending
    state().setPending(4, true)
    expect(state().pending).toBe(before)
    state().setPending(4, false)
    expect(state().pending).toEqual({})
    state().setConflict(9, true)
    expect(state().conflicts).toEqual({ 9: true })
  })
})

describe('selectors', () => {
  const cells = makeSnapshot([
    ownedCell(1, RIVAL, 2, '2026-01-01T00:00:01Z'),
    ownedCell(2, RIVAL, 2, '2026-01-01T00:00:02Z'),
    ownedCell(3, ME, 2, '2026-01-01T00:00:03Z'),
    ownedCell(4, { id: 'c', username: 'Cypher', color: '#fff000' }, 2, '2026-01-01T00:00:00Z'),
  ])

  it('computes player stats and a tie-aware rank', () => {
    expect(computeStats(cells, ME.id)).toEqual({ captured: 4, unclaimed: 621, mine: 1, minePercentage: 0.16, rank: 2 })
    expect(computeStats(cells, 'nobody')).toMatchObject({ mine: 0, rank: null })
    expect(computeStats(cells, undefined).rank).toBeNull()
  })

  it('orders the leaderboard like the server: count, earliest capture, name; ties share a rank', () => {
    const rows = computeLeaderboard(cells)
    expect(rows.map((r) => [r.rank, r.player.username, r.count])).toEqual([
      [1, 'Trinity', 2],
      [2, 'Cypher', 1], // ties with Neo on 1 cell; Cypher captured earliest
      [2, 'Neo', 1],
    ])
    expect(computeLeaderboard(cells, 1)).toHaveLength(1)
    expect(computeLeaderboard(makeSnapshot())).toEqual([])
  })
})
