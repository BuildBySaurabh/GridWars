/**
 * End-to-end through the REAL controller, store and components. Only the two
 * network edges are faked: the REST endpoints and the WebSocket client.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ApiError } from '../api/client'
import type { ServerEvent } from '../api/types'
import type { SocketOptions } from '../realtime/socket'
import { useGameStore } from '../store/gameStore'
import { useToastStore } from '../store/toastStore'
import { ME, RIVAL, makeSnapshot, ownedCell } from './factories'

const api = vi.hoisted(() => ({
  join: vi.fn(),
  getMe: vi.fn(),
  getGrid: vi.fn(),
  capture: vi.fn(),
}))
vi.mock('../api/endpoints', () => api)

const sockets = vi.hoisted(() => ({ options: [] as SocketOptions[], start: vi.fn(), stop: vi.fn() }))
vi.mock('../realtime/socket', () => ({
  GridSocket: class {
    constructor(options: SocketOptions) {
      sockets.options.push(options)
    }
    start = sockets.start
    stop = sockets.stop
  },
}))

import App from '../App'
import { controller } from '../services/gameController'

const emit = (event: ServerEvent) => act(() => sockets.options.at(-1)!.onEvent(event))
const status = (value: Parameters<SocketOptions['onStatus']>[0]) => act(() => sockets.options.at(-1)!.onStatus(value))
const ready: ServerEvent = { type: 'connection.ready', data: { player: ME, online_players: 3, server_time: 'now' } }

async function joinAs(username = 'Neo') {
  const user = userEvent.setup()
  render(<App />)
  await user.type(await screen.findByLabelText('Username'), username)
  await user.click(screen.getByRole('button', { name: /join grid/i }))
  await screen.findByLabelText('Game board')
  return user
}

beforeEach(() => {
  controller.logout() // reset the singleton between tests
  useToastStore.getState().clear()
  useGameStore.getState().reset()
  sockets.options.length = 0
  sockets.start.mockClear()
  sockets.stop.mockClear()
  Object.values(api).forEach((mock) => mock.mockReset())
  api.getMe.mockResolvedValue({})
  api.getGrid.mockResolvedValue({ cells: makeSnapshot(), server_time: 'now' })
  api.join.mockResolvedValue({ token: 'jwt', token_type: 'Bearer', expires_in: 3600, player: ME })
})

describe('GridWars app', () => {
  it('starts on the welcome screen, then joins and shows the grid, stats and leaderboard', async () => {
    await joinAs()
    expect(api.join).toHaveBeenCalledWith('Neo', expect.stringMatching(/^#[0-9A-F]{6}$/))
    expect(screen.getAllByRole('button', { name: /unclaimed/ })).toHaveLength(625)
    expect(screen.getByLabelText('Your statistics')).toBeInTheDocument()
    expect(screen.getByText(/Be the first to claim a cell/)).toBeInTheDocument()
    expect(sockets.start).toHaveBeenCalledTimes(1)
  })

  it('restores the session after a refresh without asking to join again', async () => {
    localStorage.setItem('gridwars.session', JSON.stringify({ token: 'jwt', player: ME, expiresAt: Date.now() + 1e6 }))
    api.getGrid.mockResolvedValue({ cells: makeSnapshot([ownedCell(5, RIVAL)]), server_time: 'now' })
    render(<App />)
    expect(await screen.findByLabelText('E1, owned by Trinity')).toBeInTheDocument()
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
  })

  it('a successful capture shows pending, then confirmed ownership, a toast, stats and activity', async () => {
    await joinAs()
    let resolve!: (cell: unknown) => void
    api.capture.mockReturnValue(new Promise((r) => (resolve = r)))

    fireEvent.click(screen.getByLabelText('T5, unclaimed'))
    expect(await screen.findByLabelText('T5, capturing…')).toHaveClass('cell--pending')

    await act(async () => resolve(ownedCell(120, ME)))
    expect(await screen.findByLabelText('T5, owned by you')).toBeInTheDocument()
    expect(screen.getByText('Captured T5!')).toBeInTheDocument()
    expect(within(screen.getByLabelText('Your statistics')).getByText('#1')).toBeInTheDocument()
    expect(within(screen.getByLabelText('Recent activity')).getByText(/You/)).toBeInTheDocument()
  })

  it('a lost race shows a conflict, the real owner, and a clear message', async () => {
    await joinAs()
    api.capture.mockRejectedValue(
      new ApiError(409, 'cell_already_captured', 'taken', { cell: ownedCell(150, RIVAL) }),
    )
    fireEvent.click(screen.getByLabelText('Y6, unclaimed'))
    expect(await screen.findByText('Too slow! Trinity captured Y6 first.')).toBeInTheDocument()
    expect(screen.getByLabelText('Y6, owned by Trinity')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('other players’ captures appear live via WebSocket, with the leaderboard and feed updating', async () => {
    await joinAs()
    emit(ready)
    emit({
      type: 'cell.captured',
      data: { cell_id: 120, row: 4, column: 19, owner: RIVAL, captured_at: new Date().toISOString(), version: 2 },
    })
    expect(await screen.findByLabelText('T5, owned by Trinity')).toBeInTheDocument()
    const board = within(screen.getByLabelText('Leaderboard'))
    expect(board.getByText('Trinity')).toBeInTheDocument()
    expect(within(screen.getByLabelText('Recent activity')).getByText(/Trinity/)).toBeInTheDocument()
  })

  it('ignores a stale event that would overwrite a newer cell', async () => {
    await joinAs()
    emit({ type: 'cell.captured', data: { cell_id: 7, row: 0, column: 6, owner: RIVAL, captured_at: 'a', version: 3 } })
    emit({ type: 'cell.captured', data: { cell_id: 7, row: 0, column: 6, owner: ME, captured_at: 'b', version: 2 } })
    expect(await screen.findByLabelText('G1, owned by Trinity')).toBeInTheDocument()
  })

  it('shows the online count and connection state, and a banner while reconnecting', async () => {
    await joinAs()
    status('connected')
    emit(ready)
    expect(screen.getByRole('status', { name: 'Connection status: Live' })).toBeInTheDocument()
    expect(screen.getByLabelText('3 players online')).toBeInTheDocument()

    status('reconnecting')
    expect(screen.getByRole('status', { name: 'Connection status: Reconnecting…' })).toBeInTheDocument()
    expect(screen.getByText(/Connection lost — reconnecting/)).toBeInTheDocument()

    status('connected')
    await waitFor(() => expect(screen.queryByText(/Connection lost/)).not.toBeInTheDocument())
  })

  it('after a reconnect, a fresh snapshot restores captures missed while offline', async () => {
    await joinAs()
    emit(ready)
    status('reconnecting')
    api.getGrid.mockResolvedValue({ cells: makeSnapshot([ownedCell(33, RIVAL, 5)]), server_time: 'now' })

    status('connected')
    emit(ready) // the server confirms the new connection
    expect(await screen.findByLabelText('H2, owned by Trinity')).toBeInTheDocument()
  })

  it('shows a retryable error state when the grid cannot be loaded', async () => {
    api.getGrid.mockRejectedValueOnce(new ApiError(0, 'network_error', 'Cannot reach the server. Check your connection.'))
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText('Username'), 'Neo')
    await user.click(screen.getByRole('button', { name: /join grid/i }))

    expect(await screen.findByText("Couldn't load the grid")).toBeInTheDocument()
    expect(screen.getByText(/Cannot reach the server/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByLabelText('Game board')).toBeInTheDocument()
  })

  it('leaving the game returns to the welcome screen', async () => {
    const user = await joinAs()
    await user.click(screen.getByRole('button', { name: /Neo/ }))
    await user.click(screen.getByRole('button', { name: /leave game/i }))
    await user.click(screen.getByRole('button', { name: 'Leave' }))
    expect(await screen.findByLabelText('Username')).toBeInTheDocument()
    expect(sockets.stop).toHaveBeenCalled()
    expect(localStorage.getItem('gridwars.session')).toBeNull()
  })

  it('returns to the welcome screen when the server rejects the token over WebSocket', async () => {
    await joinAs()
    act(() => sockets.options.at(-1)!.onAuthFailed())
    expect(await screen.findByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByText(/no longer valid/)).toBeInTheDocument()
  })
})
