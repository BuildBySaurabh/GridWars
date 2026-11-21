import { memo, useEffect, useRef, useState } from 'react'

import { coordLabel } from '../lib/grid'
import { controller } from '../services/gameController'
import { useGameStore } from '../store/gameStore'

/** True for ~0.6s after this cell changes owner while mounted (not on first render). */
function useCapturePop(version: number): boolean {
  const previous = useRef(version)
  const [popping, setPopping] = useState(false)

  useEffect(() => {
    const was = previous.current
    previous.current = version
    if (was === 0 || version <= was) return // first load, or nothing new
    setPopping(true)
    const timer = setTimeout(() => setPopping(false), 600)
    return () => clearTimeout(timer)
  }, [version])

  return popping
}

/**
 * One grid cell. Subscribes only to its own slice of the store, so a capture
 * re-renders exactly one of the 625 cells.
 */
export const Cell = memo(function Cell({ id }: { id: number }) {
  const cell = useGameStore((state) => state.cells[id - 1])
  const pending = useGameStore((state) => state.pending[id] === true)
  const conflict = useGameStore((state) => state.conflicts[id] === true)
  const myId = useGameStore((state) => state.session?.player.id)
  const popping = useCapturePop(cell.version)

  const known = cell.version > 0
  const owner = cell.owner
  const mine = owner !== null && owner.id === myId
  const free = known && owner === null && !pending

  const classes = ['cell']
  if (!known) classes.push('cell--unknown')
  else if (conflict) classes.push('cell--conflict')
  else if (pending) classes.push('cell--pending')
  else if (owner) classes.push('cell--owned', mine ? 'cell--mine' : '')
  else classes.push('cell--free')
  if (popping) classes.push('cell--pop')

  const label = coordLabel(cell.row, cell.column)
  const state = !known
    ? 'loading'
    : pending
      ? 'capturing…'
      : owner
        ? mine
          ? 'owned by you'
          : `owned by ${owner.username}`
        : 'unclaimed'
  const showColor = owner !== null && !pending && !conflict

  return (
    <button
      type="button"
      data-cell-id={id}
      className={classes.join(' ')}
      style={showColor ? { backgroundColor: owner.color, color: owner.color } : undefined}
      aria-label={`${label}, ${state}`}
      aria-disabled={!free}
      title={`${label} · ${state}`}
      tabIndex={id === 1 ? 0 : -1}
      onClick={() => {
        if (free) void controller.captureCell(id)
      }}
    />
  )
})
