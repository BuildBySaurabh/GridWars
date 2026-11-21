import { ApiError } from '../api/client'
import type { Cell, ServerEvent } from '../api/types'
import { createController, type ControllerDeps } from '../services/gameController'
import type { Session } from '../services/session'
import { useGameStore } from '../store/gameStore'
import { useToastStore } from '../store/toastStore'
import type { SocketOptions } from '../realtime/socket'
import { ME, RIVAL, makeSnapshot, ownedCell } from './factories'

const SESSION: Session = { token: 'jwt', player: ME, expiresAt: Date.now() + 3_600_000 }
const game = () => useGameStore.getState()
const toasts = () => useToastStore.getState().toasts.map((t) => `${t.kind}: ${t.message}`)

function setup(initial: { session?: Session | null; snapshot?: Cell[] } = {}) {
  const socketOptions: SocketOptions[] = []
  const socket = { start: vi.fn(), stop: vi.fn() }
  const api = {
    join: vi.fn(),
    getMe: vi.fn().mockResolvedValue({}),
    getGrid: vi.fn().mockResolvedValue({ cells: initial.snapshot ?? makeSnapshot(), server_time: 'now' }),
    capture: vi.fn(),
  }
  const storage = {
    load: vi.fn().mockReturnValue(initial.session ?? null),
    save: vi.fn(),
    clear: vi.fn(),
  }
  const deps: ControllerDeps = {
    api,
    storage,
    wsUrl: 'ws://test',
    conflictFlashMs: 50,
    createSocket: (options) => {
      socketOptions.push(options)
      return socket
    },
  }
  const controller = createController(deps)
  const emit = (event: ServerEvent) => socketOptions[0]!.onEvent(event)
  return { controller, api, storage, socket, socketOptions, emit }
}

async function signedInGame(snapshot?: Cell[]) {
  const ctx = setup({ session: SESSION, snapshot })
  await ctx.controller.bootstrap()
  return ctx
}

beforeEach(() => {
  game().reset()
  useToastStore.getState().clear()
})

describe('bootstrap / join / logout', () => {
  it('shows the welcome screen when there is no stored session', async () => {
    const { controller, socket } = setup()
    await controller.bootstrap()
    expect(game().phase).toBe('welcome')
    expect(socket.start).not.toHaveBeenCalled()
  })

  it('restores a stored session: loads the grid, then connects the socket', async () => {
    const { api, socket } = await signedInGame([ownedCell(1, RIVAL)] as unknown as Cell[])
    expect(api.getMe).toHaveBeenCalled()
    expect(game().phase).toBe('ready')
    expect(game().hasSnapshot).toBe(true)
    expect(game().cells[0]!.owner?.id).toBe(RIVAL.id)
    expect(socket.start).toHaveBeenCalledTimes(1)
  })

  it('discards a stored session the server rejects', async () => {
    const { controller, api, storage, socket } = setup({ session: SESSION })
    api.getMe.mockRejectedValue(new ApiError(401, 'token_not_valid', 'bad'))
    await controller.bootstrap()
    expect(game().phase).toBe('welcome')
    expect(game().session).toBeNull()
    expect(storage.clear).toHaveBeenCalled()
    expect(socket.start).not.toHaveBeenCalled()
  })

  it('surfaces a retryable error when the grid cannot be loaded', async () => {
    const { controller, api } = setup({ session: SESSION })
    api.getGrid.mockRejectedValueOnce(new ApiError(0, 'network_error', 'Cannot reach the server.'))
    await controller.bootstrap()
    expect(game().phase).toBe('error')
    expect(game().loadError).toBe('Cannot reach the server.')
    await controller.retry()
    expect(game().phase).toBe('ready')
  })

  it('join stores the session, loads the grid and connects', async () => {
    const { controller, api, storage, socket } = setup()
    api.join.mockResolvedValue({ token: 't', token_type: 'Bearer', expires_in: 60, player: ME })
    await controller.join('  Neo  ', '#22D3EE')
    expect(api.join).toHaveBeenCalledWith('Neo', '#22D3EE') // trimmed
    expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({ token: 't', player: ME }))
    expect(game().phase).toBe('ready')
    expect(socket.start).toHaveBeenCalled()
  })

  it('join propagates API errors so the form can show them (and stores nothing)', async () => {
    const { controller, api, storage } = setup()
    api.join.mockRejectedValue(new ApiError(409, 'username_taken', 'That username is already taken.'))
    await expect(controller.join('Neo', '#22D3EE')).rejects.toMatchObject({ code: 'username_taken' })
    expect(storage.save).not.toHaveBeenCalled()
    expect(game().session).toBeNull()
  })

  it('logout stops the socket, clears storage and state', async () => {
    const { controller, storage, socket } = await signedInGame()
    controller.logout('Bye')
    expect(socket.stop).toHaveBeenCalled()
    expect(storage.clear).toHaveBeenCalled()
    expect(game().session).toBeNull()
    expect(game().phase).toBe('welcome')
    expect(game().hasSnapshot).toBe(false)
    expect(toasts()).toContain('info: Bye')
  })

  it('logs out when the socket reports an invalid token', async () => {
    const { socketOptions } = await signedInGame()
    socketOptions[0]!.onAuthFailed()
    expect(game().phase).toBe('welcome')
    expect(toasts().some((t) => t.includes('no longer valid'))).toBe(true)
  })
})

describe('capture', () => {
  it('marks the cell pending, and only applies ownership once the server confirms', async () => {
    const { controller, api } = await signedInGame()
    let resolve!: (cell: Cell) => void
    api.capture.mockReturnValue(new Promise<Cell>((r) => (resolve = r)))

    const done = controller.captureCell(120)
    expect(game().pending[120]).toBe(true)
    expect(game().cells[119]!.owner).toBeNull() // nothing assumed while pending

    resolve(ownedCell(120, ME))
    await done
    expect(game().pending[120]).toBeUndefined()
    expect(game().cells[119]!.owner?.id).toBe(ME.id)
    expect(toasts()).toEqual(['success: Captured T5!'])
  })

  it('on 409 shows who won, applies the real owner and flashes a conflict', async () => {
    const { controller, api } = await signedInGame()
    api.capture.mockRejectedValue(
      new ApiError(409, 'cell_already_captured', 'taken', { cell: ownedCell(150, RIVAL) }),
    )
    await controller.captureCell(150)
    expect(game().cells[149]!.owner?.id).toBe(RIVAL.id) // converges on the server's truth
    expect(game().conflicts[150]).toBe(true)
    expect(toasts()).toEqual(['error: Too slow! Trinity captured Y6 first.'])
    expect(game().pending[150]).toBeUndefined()
    await vi.waitFor(() => expect(game().conflicts[150]).toBeUndefined())
  })

  it('on 409 for a cell you already own, informs without flagging a conflict', async () => {
    const { controller, api } = await signedInGame()
    api.capture.mockRejectedValue(new ApiError(409, 'cell_already_captured', 'x', { cell: ownedCell(8, ME) }))
    await controller.captureCell(8)
    expect(game().conflicts[8]).toBeUndefined()
    expect(toasts()).toEqual(['info: You already own H1.'])
  })

  it('does not send a request for a cell that is already owned or already pending', async () => {
    const { controller, api } = await signedInGame([ownedCell(5, RIVAL)] as unknown as Cell[])
    await controller.captureCell(5)
    expect(api.capture).not.toHaveBeenCalled()

    let resolve!: (cell: Cell) => void
    api.capture.mockReturnValue(new Promise<Cell>((r) => (resolve = r)))
    const first = controller.captureCell(6)
    await controller.captureCell(6) // double click while in flight
    expect(api.capture).toHaveBeenCalledTimes(1)
    resolve(ownedCell(6, ME))
    await first
  })

  it('ignores captures when signed out', async () => {
    const { controller, api } = setup()
    await controller.captureCell(1)
    expect(api.capture).not.toHaveBeenCalled()
  })

  it('on 401 ends the session', async () => {
    const { controller, api, socket } = await signedInGame()
    api.capture.mockRejectedValue(new ApiError(401, 'token_not_valid', 'expired'))
    await controller.captureCell(2)
    expect(game().phase).toBe('welcome')
    expect(socket.stop).toHaveBeenCalled()
  })

  it('on 429 asks the user to slow down', async () => {
    const { controller, api } = await signedInGame()
    api.capture.mockRejectedValue(new ApiError(429, 'throttled', 'slow'))
    await controller.captureCell(2)
    expect(toasts()[0]).toMatch(/error: Slow down/)
    expect(game().cells[1]!.owner).toBeNull()
  })

  it('on a network error does not assume success and re-syncs the grid', async () => {
    const { controller, api } = await signedInGame()
    api.capture.mockRejectedValue(new ApiError(0, 'network_error', 'offline'))
    api.getGrid.mockClear()
    await controller.captureCell(2)
    expect(game().cells[1]!.owner).toBeNull()
    expect(toasts()[0]).toMatch(/capture not confirmed/)
    expect(api.getGrid).toHaveBeenCalledTimes(1)
    expect(game().pending[2]).toBeUndefined()
  })

  it('reports unexpected failures and always clears the pending flag', async () => {
    const { controller, api } = await signedInGame()
    api.capture.mockRejectedValue(new Error('boom'))
    await controller.captureCell(3)
    expect(toasts()[0]).toMatch(/error: Something went wrong/)
    expect(game().pending[3]).toBeUndefined()
  })
})

describe('real-time synchronisation', () => {
  it('applies cell.captured events from other players', async () => {
    const { emit } = await signedInGame()
    emit({
      type: 'cell.captured',
      data: { cell_id: 120, row: 4, column: 19, owner: RIVAL, captured_at: '2026-11-16T12:00:00Z', version: 2 },
    })
    expect(game().cells[119]!.owner?.id).toBe(RIVAL.id)
    expect(game().activity[0]).toMatchObject({ cellId: 120, owner: RIVAL })
  })

  it('a stale event cannot overwrite newer state', async () => {
    const { emit } = await signedInGame([ownedCell(120, ME, 3)] as unknown as Cell[])
    emit({
      type: 'cell.captured',
      data: { cell_id: 120, row: 4, column: 19, owner: RIVAL, captured_at: 'x', version: 2 },
    })
    expect(game().cells[119]!.owner?.id).toBe(ME.id)
  })

  it('the REST response and the matching WebSocket event produce one change and one activity entry', async () => {
    const { controller, api, emit } = await signedInGame()
    api.capture.mockResolvedValue(ownedCell(120, ME))
    await controller.captureCell(120)
    emit({
      type: 'cell.captured',
      data: { cell_id: 120, row: 4, column: 19, owner: ME, captured_at: '2026-11-16T12:00:00Z', version: 2 },
    })
    expect(game().activity).toHaveLength(1)
  })

  it('tracks presence from ready, presence and pong events', async () => {
    const { emit } = await signedInGame()
    emit({ type: 'presence.updated', data: { online_players: 5 } })
    expect(game().onlinePlayers).toBe(5)
    emit({ type: 'pong', data: { online_players: 6, server_time: 'now' } })
    expect(game().onlinePlayers).toBe(6)
  })

  it('refetches a snapshot on every connection.ready, recovering captures missed while offline', async () => {
    const { api, emit } = await signedInGame()
    api.getGrid.mockClear()
    api.getGrid.mockResolvedValue({ cells: makeSnapshot([ownedCell(33, RIVAL, 4)]), server_time: 'now' })

    emit({ type: 'connection.ready', data: { player: ME, online_players: 2, server_time: 'now' } })
    await vi.waitFor(() => expect(game().cells[32]!.owner?.id).toBe(RIVAL.id))
    expect(api.getGrid).toHaveBeenCalledTimes(1)
    expect(game().onlinePlayers).toBe(2)

    emit({ type: 'connection.ready', data: { player: ME, online_players: 2, server_time: 'now' } }) // a later reconnect
    await vi.waitFor(() => expect(api.getGrid).toHaveBeenCalledTimes(2))
  })

  it('mirrors the connection status into the store', async () => {
    const { socketOptions } = await signedInGame()
    socketOptions[0]!.onStatus('reconnecting')
    expect(game().connection).toBe('reconnecting')
  })
})
