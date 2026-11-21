import { act, render, screen, within } from '@testing-library/react'

import { ActivityFeed } from '../components/ActivityFeed'
import { Leaderboard } from '../components/Leaderboard'
import { PlayerPanel } from '../components/PlayerPanel'
import { useGameStore } from '../store/gameStore'
import { ME, RIVAL, makeSnapshot, ownedCell } from './factories'

vi.mock('../services/gameController', () => ({ controller: {} }))

const store = () => useGameStore.getState()

beforeEach(() => {
  store().reset()
  store().setSession({ token: 't', player: ME, expiresAt: Date.now() + 1e6 })
})

describe('sidebar panels', () => {
  it('show skeletons before the first snapshot', () => {
    render(
      <>
        <PlayerPanel />
        <Leaderboard />
        <ActivityFeed />
      </>,
    )
    expect(screen.getByLabelText('Loading your stats')).toBeInTheDocument()
    expect(document.querySelectorAll('[aria-busy="true"]').length).toBe(3)
  })

  it('show empty states on a fresh grid', () => {
    store().applySnapshot(makeSnapshot())
    render(
      <>
        <PlayerPanel />
        <Leaderboard />
        <ActivityFeed />
      </>,
    )
    expect(screen.getByText(/Be the first to claim a cell/)).toBeInTheDocument()
    expect(screen.getByText(/Waiting for the next capture/)).toBeInTheDocument()
    const stats = screen.getByLabelText('Your statistics')
    expect(within(stats).getByText('625')).toBeInTheDocument() // unclaimed
    expect(within(stats).getByText('—')).toBeInTheDocument() // no rank yet
  })

  it('player stats, leaderboard and activity update live as captures arrive', () => {
    store().applySnapshot(makeSnapshot())
    render(
      <>
        <PlayerPanel />
        <Leaderboard />
        <ActivityFeed />
      </>,
    )

    act(() => {
      store().applyCell(ownedCell(1, RIVAL, 2, new Date().toISOString()))
      store().applyCell(ownedCell(2, RIVAL, 2, new Date().toISOString()))
      store().applyCell(ownedCell(3, ME, 2, new Date().toISOString()))
    })

    const stats = screen.getByLabelText('Your statistics')
    expect(within(stats).getByText('#2')).toBeInTheDocument() // behind Trinity's 2 cells
    expect(within(stats).getByText('0.16%')).toBeInTheDocument() // Neo: 1 of 625 cells
    expect(within(stats).getByText('3 / 625')).toBeInTheDocument()
    expect(within(stats).getByText('622')).toBeInTheDocument()

    const rows = within(screen.getByLabelText('Leaderboard')).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Trinity')
    expect(rows[0]).toHaveTextContent('2')
    expect(rows[1]).toHaveTextContent('Neo')
    expect(rows[1]).toHaveTextContent('you')

    const feed = within(screen.getByLabelText('Recent activity')).getAllByRole('listitem')
    expect(feed).toHaveLength(3)
    expect(feed[0]).toHaveTextContent('You captured C1') // newest first
    expect(feed[1]).toHaveTextContent('Trinity captured B1')
  })

  it('pins the player’s own row when they are outside the top 10', () => {
    const others = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, username: `Player${i}`, color: '#ffffff' }))
    const owned = [
      ...others.flatMap((p, i) => [ownedCell(i * 2 + 1, p, 2, `2026-01-01T00:00:${10 + i}Z`), ownedCell(i * 2 + 2, p, 2, `2026-01-01T00:00:${10 + i}Z`)]),
      ownedCell(100, ME, 2, '2026-01-01T00:10:00Z'),
    ]
    store().applySnapshot(makeSnapshot(owned))
    render(<Leaderboard />)
    const rows = within(screen.getByLabelText('Leaderboard')).getAllByRole('listitem')
    expect(rows.some((row) => row.textContent?.includes('Neo'))).toBe(true)
    expect(rows.at(-1)).toHaveTextContent('Neo')
    expect(rows.at(-1)).toHaveTextContent('12') // rank after 11 players with 2 cells each
  })
})
