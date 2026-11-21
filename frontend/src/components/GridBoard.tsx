import { Grid3x3, MousePointerClick, ZoomIn, ZoomOut } from 'lucide-react'
import { Fragment, memo, useCallback, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react'

import { CELL_IDS, GRID_SIZE, INDEXES, coordLabel, columnLetter } from '../lib/grid'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import { Cell } from './Cell'
import { Button } from './ui/Button'

const ZOOM_LEVELS = [1, 1.5, 2, 3] as const

/** The 625 cells. Only re-renders when the axis labels are toggled; each Cell updates itself. */
const CellRows = memo(function CellRows({ coords }: { coords: boolean }) {
  return (
    <>
      {coords ? <div aria-hidden="true" /> : null}
      {coords
        ? INDEXES.map((column) => (
            <div key={`c${column}`} aria-hidden="true" className="text-center text-[9px] leading-none text-muted select-none sm:text-[10px]">
              {columnLetter(column)}
            </div>
          ))
        : null}
      {INDEXES.map((row) => (
        <Fragment key={`r${row}`}>
          {coords ? (
            <div aria-hidden="true" className="flex items-center justify-end pr-0.5 text-[9px] leading-none text-muted select-none sm:text-[10px]">
              {row + 1}
            </div>
          ) : null}
          {INDEXES.map((column) => (
            <Cell key={CELL_IDS[row * GRID_SIZE + column]} id={row * GRID_SIZE + column + 1} />
          ))}
        </Fragment>
      ))}
    </>
  )
})

function InfoBar({ hoverId }: { hoverId: number | null }) {
  const cell = useGameStore((state) => (hoverId ? state.cells[hoverId - 1] : undefined))
  const myId = useGameStore((state) => state.session?.player.id)

  let detail = 'Hover or focus a cell to inspect it'
  let swatch: string | null = null
  if (cell && cell.version > 0) {
    if (cell.owner) {
      detail = cell.owner.id === myId ? 'Owned by you' : `Owned by ${cell.owner.username}`
      swatch = cell.owner.color
    } else {
      detail = 'Unclaimed — click to capture'
    }
  }

  return (
    <div className="flex min-h-9 min-w-0 flex-1 items-center gap-2 text-sm" aria-live="off">
      <span className="grid h-7 min-w-11 place-items-center rounded-lg bg-brand/10 px-2 font-mono text-xs font-semibold text-brand">
        {cell ? coordLabel(cell.row, cell.column) : '––'}
      </span>
      {swatch ? <span className="h-3 w-3 rounded-full" style={{ backgroundColor: swatch }} aria-hidden="true" /> : null}
      <span className="truncate text-muted">{detail}</span>
    </div>
  )
}

function Legend() {
  const color = useGameStore((state) => state.session?.player.color)
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <li className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[3px] bg-cell ring-1 ring-line" aria-hidden="true" /> Unclaimed
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="h-3 w-3 rounded-[3px] ring-2 ring-white/80"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        Yours
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[3px] bg-linear-to-br from-brand to-accent" aria-hidden="true" /> Other players
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[3px] bg-bad" aria-hidden="true" /> Lost the race
      </li>
    </ul>
  )
}

export function GridSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4" aria-busy="true" aria-label="Loading grid">
      <div className="skeleton mb-3 h-8 w-1/2" />
      <div className="skeleton mx-auto aspect-square w-full max-w-[40rem]" />
    </div>
  )
}

export function GridBoard() {
  const hasSnapshot = useGameStore((state) => state.hasSnapshot)
  const coords = useUiStore((state) => state.settings.showCoordinates)
  const [hoverId, setHoverId] = useState<number | null>(null)
  const [zoomIndex, setZoomIndex] = useState(0)
  const zoom = ZOOM_LEVELS[zoomIndex] ?? 1

  const track = useCallback((target: EventTarget) => {
    const element = (target as HTMLElement).closest?.('[data-cell-id]')
    if (element) setHoverId(Number(element.getAttribute('data-cell-id')))
  }, [])

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const current = (event.target as HTMLElement).closest?.('[data-cell-id]')
    if (!current) return
    const id = Number(current.getAttribute('data-cell-id'))
    const row = Math.floor((id - 1) / GRID_SIZE)
    const column = (id - 1) % GRID_SIZE
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    const nextRow = Math.min(GRID_SIZE - 1, Math.max(0, row + move[0]))
    const nextColumn = Math.min(GRID_SIZE - 1, Math.max(0, column + move[1]))
    const next = event.currentTarget.querySelector<HTMLElement>(`[data-cell-id="${nextRow * GRID_SIZE + nextColumn + 1}"]`)
    next?.focus()
  }, [])

  if (!hasSnapshot) return <GridSkeleton />

  return (
    <section className="rounded-2xl border border-line bg-panel p-3 shadow-panel sm:p-4" aria-label="Game board">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-semibold tabular-nums">
            <Grid3x3 className="h-3.5 w-3.5 text-brand" aria-hidden="true" /> 25 × 25
          </span>
          <InfoBar hoverId={hoverId} />
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
            disabled={zoomIndex === 0}
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="w-10 text-center text-xs tabular-nums text-muted" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            size="sm"
            onClick={() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="max-h-[calc(100dvh-14rem)] min-h-64 overflow-auto overscroll-contain rounded-xl border border-line bg-surface">
        <div
          role="group"
          aria-label="Grid of 625 cells. Use arrow keys to move and Enter to capture."
          className="mx-auto grid gap-[2px] p-2 sm:gap-[3px] sm:p-3"
          style={{
            gridTemplateColumns: `${coords ? '1.1rem ' : ''}repeat(${GRID_SIZE}, minmax(0, 1fr))`,
            // Never narrower than 32rem, so cells stay tappable on phones (the frame scrolls instead).
            width: `max(min(${zoom * 100}%, calc(${zoom} * max(22rem, 100dvh - 16rem))), calc(${zoom} * 32rem))`,
          }}
          onPointerOver={(event: PointerEvent<HTMLDivElement>) => track(event.target)}
          onFocus={(event: FocusEvent<HTMLDivElement>) => track(event.target)}
          onKeyDown={onKeyDown}
        >
          <CellRows coords={coords} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Legend />
        <p className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
          <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" /> Click an unclaimed cell to capture it
        </p>
      </div>
    </section>
  )
}
