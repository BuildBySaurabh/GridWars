import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { GamePage } from '../pages/GamePage'
import { useGameStore } from '../store/gameStore'
import { useUiStore, viewFromHash } from '../store/uiStore'
import { ME, RIVAL, makeSnapshot, ownedCell } from './factories'

vi.mock('../services/gameController', () => ({ controller: { captureCell: vi.fn(), logout: vi.fn(), retry: vi.fn() } }))

beforeEach(() => {
  useGameStore.getState().reset()
  useGameStore.getState().setSession({ token: 't', player: ME, expiresAt: Date.now() + 1e6 })
  useGameStore.getState().setPhase('ready')
  useGameStore.getState().applySnapshot(makeSnapshot())
})

describe('app shell', () => {
  it('shows the live grid with the 25 × 25 label on Play', () => {
    render(<GamePage />)
    expect(screen.getByLabelText('Game board')).toBeInTheDocument()
    expect(screen.getByText('25 × 25')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /unclaimed/ })).toHaveLength(625)
  })

  it('navigates between views from the sidebar and keeps the URL hash in sync', async () => {
    const user = userEvent.setup()
    render(<GamePage />)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('button', { name: 'Play' })).toHaveAttribute('aria-current', 'page')

    await user.click(within(nav).getByRole('button', { name: 'Leaderboard' }))
    expect(location.hash).toBe('#/leaderboard')
    expect(screen.queryByLabelText('Game board')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Leaderboard')).toBeInTheDocument()

    await user.click(within(nav).getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('switch', { name: 'Show coordinates' })).toBeChecked()
  })

  it('falls back to Play for an unknown hash', () => {
    expect(viewFromHash('#/nonsense')).toBe('play')
    expect(viewFromHash('#/profile')).toBe('profile')
  })

  it('the leaderboard view shows real standings', async () => {
    useGameStore.getState().applyCell(ownedCell(1, RIVAL, 2, new Date().toISOString()))
    act(() => useUiStore.getState().setView('leaderboard'))
    render(<GamePage />)
    const rows = within(screen.getByLabelText('Leaderboard')).getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Trinity')
  })

  it('settings persist and hide the coordinate labels', async () => {
    const user = userEvent.setup()
    const { container } = render(<GamePage />)
    expect(container.querySelectorAll('[aria-hidden="true"].select-none').length).toBe(50) // 25 columns + 25 rows

    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('switch', { name: 'Show coordinates' }))
    expect(JSON.parse(localStorage.getItem('gridwars.settings')!)).toMatchObject({ showCoordinates: false })

    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Play' }))
    expect(container.querySelectorAll('[aria-hidden="true"].select-none').length).toBe(0)
    act(() => useUiStore.getState().updateSettings({ showCoordinates: true }))
  })

  it('reduce motion sets a document attribute', async () => {
    act(() => useUiStore.getState().updateSettings({ reduceMotion: true }))
    expect(document.documentElement.dataset.motion).toBe('reduced')
    act(() => useUiStore.getState().updateSettings({ reduceMotion: false }))
    expect(document.documentElement.dataset.motion).toBeUndefined()
  })

  it('the mobile menu opens, navigates, and closes with Escape', async () => {
    const user = userEvent.setup()
    render(<GamePage />)
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    const dialog = screen.getByRole('dialog', { name: 'Main menu' })
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Profile' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /leave game/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the error state with a retry when the grid fails to load', () => {
    useGameStore.getState().setPhase('error', 'Cannot reach the server.')
    render(<GamePage />)
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server.')
  })
})
