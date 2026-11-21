import { act, fireEvent, render, screen } from '@testing-library/react'

import { GridBoard } from '../components/GridBoard'
import { useGameStore } from '../store/gameStore'
import { ME, RIVAL, makeSnapshot, ownedCell } from './factories'

const captureCell = vi.fn()
vi.mock('../services/gameController', () => ({
  controller: { captureCell: (id: number) => captureCell(id) },
}))

const session = { token: 't', player: ME, expiresAt: Date.now() + 1e6 }
const store = () => useGameStore.getState()

function cells(container: HTMLElement) {
  return container.querySelectorAll<HTMLButtonElement>('[data-cell-id]')
}

beforeEach(() => {
  captureCell.mockReset()
  store().reset()
  store().setSession(session)
})

describe('GridBoard', () => {
  it('shows a skeleton until the first snapshot arrives', () => {
    render(<GridBoard />)
    expect(screen.getByLabelText('Loading grid')).toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('renders all 625 cells with accessible labels for each state', () => {
    store().applySnapshot(makeSnapshot([ownedCell(2, RIVAL), ownedCell(3, ME)]))
    const { container } = render(<GridBoard />)

    expect(cells(container)).toHaveLength(625)
    expect(screen.getByLabelText('A1, unclaimed')).toBeInTheDocument()
    expect(screen.getByLabelText('B1, owned by Trinity')).toBeInTheDocument()
    expect(screen.getByLabelText('C1, owned by you')).toBeInTheDocument()
    expect(screen.getByLabelText('Y25, unclaimed')).toBeInTheDocument() // last cell
  })

  it('paints owned cells in their owner colour and leaves free cells neutral', () => {
    store().applySnapshot(makeSnapshot([ownedCell(2, RIVAL)]))
    render(<GridBoard />)
    expect(screen.getByLabelText('B1, owned by Trinity')).toHaveStyle({ backgroundColor: RIVAL.color })
    expect(screen.getByLabelText('A1, unclaimed')).toHaveClass('cell--free')
    expect(screen.getByLabelText('B1, owned by Trinity')).toHaveClass('cell--owned')
  })

  it('marks the current player’s cells distinctly', () => {
    store().applySnapshot(makeSnapshot([ownedCell(3, ME)]))
    render(<GridBoard />)
    expect(screen.getByLabelText('C1, owned by you')).toHaveClass('cell--mine')
  })

  it('requests a capture when an unclaimed cell is clicked', () => {
    store().applySnapshot(makeSnapshot())
    render(<GridBoard />)
    fireEvent.click(screen.getByLabelText('T5, unclaimed'))
    expect(captureCell).toHaveBeenCalledExactlyOnceWith(120)
  })

  it('does nothing when an owned cell is clicked', () => {
    store().applySnapshot(makeSnapshot([ownedCell(2, RIVAL), ownedCell(3, ME)]))
    render(<GridBoard />)
    fireEvent.click(screen.getByLabelText('B1, owned by Trinity'))
    fireEvent.click(screen.getByLabelText('C1, owned by you'))
    expect(captureCell).not.toHaveBeenCalled()
    expect(screen.getByLabelText('B1, owned by Trinity')).toHaveAttribute('aria-disabled', 'true')
  })

  it('shows pending feedback and ignores clicks while a capture is in flight', () => {
    store().applySnapshot(makeSnapshot())
    render(<GridBoard />)
    act(() => store().setPending(1, true))
    const cell = screen.getByLabelText('A1, capturing…')
    expect(cell).toHaveClass('cell--pending')
    fireEvent.click(cell)
    expect(captureCell).not.toHaveBeenCalled()
  })

  it('shows conflict feedback on a cell that was lost', () => {
    store().applySnapshot(makeSnapshot())
    render(<GridBoard />)
    act(() => {
      store().applyCell(ownedCell(1, RIVAL))
      store().setConflict(1, true)
    })
    expect(screen.getByLabelText('A1, owned by Trinity')).toHaveClass('cell--conflict')
  })

  it('updates a single cell live when the store changes (and animates the capture)', () => {
    store().applySnapshot(makeSnapshot())
    render(<GridBoard />)
    expect(screen.getByLabelText('D1, unclaimed')).toBeInTheDocument()

    act(() => void store().applyCell(ownedCell(4, RIVAL)))

    const cell = screen.getByLabelText('D1, owned by Trinity')
    expect(cell).toHaveStyle({ backgroundColor: RIVAL.color })
    expect(cell).toHaveClass('cell--pop')
    expect(screen.getByLabelText('E1, unclaimed')).not.toHaveClass('cell--pop')
  })

  it('does not animate cells that arrive with the initial snapshot', () => {
    store().applySnapshot(makeSnapshot([ownedCell(2, RIVAL)]))
    render(<GridBoard />)
    expect(screen.getByLabelText('B1, owned by Trinity')).not.toHaveClass('cell--pop')
  })

  it('shows coordinates and owner when a cell is hovered', () => {
    store().applySnapshot(makeSnapshot([ownedCell(2, RIVAL)]))
    render(<GridBoard />)
    expect(screen.getByText(/Hover or focus a cell/)).toBeInTheDocument()

    fireEvent.pointerOver(screen.getByLabelText('B1, owned by Trinity'))
    expect(screen.getByText('B1')).toBeInTheDocument()
    expect(screen.getByText('Owned by Trinity')).toBeInTheDocument()

    fireEvent.pointerOver(screen.getByLabelText('A1, unclaimed'))
    expect(screen.getByText(/Unclaimed — click to capture/)).toBeInTheDocument()
  })

  it('supports arrow-key navigation between cells', () => {
    store().applySnapshot(makeSnapshot())
    render(<GridBoard />)
    const start = screen.getByLabelText('A1, unclaimed')
    start.focus()
    fireEvent.keyDown(start, { key: 'ArrowRight' })
    expect(screen.getByLabelText('B1, unclaimed')).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(screen.getByLabelText('B2, unclaimed')).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' }) // clamps at the edge
    expect(screen.getByLabelText('A2, unclaimed')).toHaveFocus()
  })

  it('zoom controls resize the board within their bounds', () => {
    store().applySnapshot(makeSnapshot())
    render(<GridBoard />)
    const zoomOut = screen.getByLabelText('Zoom out')
    const zoomIn = screen.getByLabelText('Zoom in')
    expect(zoomOut).toBeDisabled()
    expect(screen.getByText('100%')).toBeInTheDocument()
    fireEvent.click(zoomIn)
    expect(screen.getByText('150%')).toBeInTheDocument()
    fireEvent.click(zoomIn)
    fireEvent.click(zoomIn)
    expect(screen.getByText('300%')).toBeInTheDocument()
    expect(zoomIn).toBeDisabled()
    fireEvent.click(zoomOut)
    expect(screen.getByText('200%')).toBeInTheDocument()
  })
})
