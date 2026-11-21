import type { ServerEvent } from '../api/types'
import { GridSocket, type ConnectionStatus } from '../realtime/socket'
import { ME } from './factories'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  readonly url: string

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.closed = true
  }
  // ---- test helpers
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  receive(payload: unknown) {
    this.onmessage?.({ data: typeof payload === 'string' ? payload : JSON.stringify(payload) })
  }
  drop(code = 1006) {
    this.readyState = 3
    this.onclose?.({ code })
  }
}

const READY = { type: 'connection.ready', data: { player: ME, online_players: 1, server_time: 'now' } }

const started: GridSocket[] = []

function setup(overrides: { token?: string | null } = {}) {
  FakeWebSocket.instances = []
  const statuses: ConnectionStatus[] = []
  const events: ServerEvent[] = []
  const onAuthFailed = vi.fn()
  const token = overrides.token === undefined ? 'jwt-1' : overrides.token
  const socket = new GridSocket({
    url: 'ws://test/ws/grid/',
    getToken: () => token,
    onEvent: (event) => events.push(event),
    onStatus: (status) => statuses.push(status),
    onAuthFailed,
    createSocket: (url) => new FakeWebSocket(url) as unknown as WebSocket,
    random: () => 1, // no jitter: delays are exactly 500, 1000, 2000 ...
    heartbeatIntervalMs: 1000,
    pongTimeoutMs: 500,
  })
  const current = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!
  started.push(socket)
  return { socket, statuses, events, onAuthFailed, current }
}

beforeEach(() => {
  vi.useFakeTimers()
})

// Sockets register window/document listeners while started; stop them so tests stay isolated.
afterEach(() => {
  started.splice(0).forEach((socket) => socket.stop())
})

describe('GridSocket', () => {
  it('sends an auth message (token not in the URL) and is connected only after connection.ready', () => {
    const { socket, statuses, current } = setup()
    socket.start()
    expect(statuses).toEqual(['connecting'])
    current().open()
    expect(current().url).toBe('ws://test/ws/grid/')
    expect(JSON.parse(current().sent[0]!)).toEqual({ type: 'auth', token: 'jwt-1' })
    expect(statuses).toEqual(['connecting']) // not connected yet
    current().receive(READY)
    expect(statuses).toEqual(['connecting', 'connected'])
  })

  it('forwards valid events and ignores malformed frames', () => {
    const { socket, events, current } = setup()
    socket.start()
    current().open()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    current().receive(READY)
    current().receive('{broken')
    current().receive({ type: 'cell.captured', data: { cell_id: 'x' } })
    current().receive({ type: 'presence.updated', data: { online_players: 4 } })
    expect(events.map((e) => e.type)).toEqual(['connection.ready', 'presence.updated'])
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('reconnects with exponential backoff after an unexpected close, and resets after success', () => {
    const { socket, statuses, current } = setup()
    socket.start()
    current().open()
    current().receive(READY)

    current().drop()
    expect(statuses.at(-1)).toBe('reconnecting')
    expect(FakeWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(499)
    expect(FakeWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(2)

    current().drop() // second failure: 1000ms
    vi.advanceTimersByTime(999)
    expect(FakeWebSocket.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(3)

    current().open()
    current().receive(READY)
    expect(statuses.at(-1)).toBe('connected')
    current().drop() // success reset the counter: back to 500ms
    vi.advanceTimersByTime(500)
    expect(FakeWebSocket.instances).toHaveLength(4)
  })

  it('re-authenticates on every reconnect', () => {
    const { socket, current } = setup()
    socket.start()
    current().open()
    current().receive(READY)
    current().drop()
    vi.advanceTimersByTime(500)
    current().open()
    expect(JSON.parse(current().sent[0]!)).toEqual({ type: 'auth', token: 'jwt-1' })
  })

  it('does not reconnect after an authentication failure and reports it', () => {
    const { socket, statuses, onAuthFailed, current } = setup()
    socket.start()
    current().open()
    current().receive({ type: 'error', data: { code: 'invalid_token', message: 'bad' } })
    current().drop(4401)
    vi.advanceTimersByTime(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(onAuthFailed).toHaveBeenCalledTimes(1)
    expect(statuses.at(-1)).toBe('disconnected')
  })

  it('treats an auth timeout (4401 without invalid_token) as a transient failure', () => {
    const { socket, onAuthFailed, current } = setup()
    socket.start()
    current().open()
    current().receive({ type: 'error', data: { code: 'auth_timeout', message: 'slow' } })
    current().drop(4401)
    vi.advanceTimersByTime(500)
    expect(FakeWebSocket.instances).toHaveLength(2)
    expect(onAuthFailed).not.toHaveBeenCalled()
  })

  it('fails fast when there is no token', () => {
    const { socket, onAuthFailed } = setup({ token: null })
    socket.start()
    expect(FakeWebSocket.instances).toHaveLength(0)
    expect(onAuthFailed).toHaveBeenCalledTimes(1)
  })

  it('stop() closes the socket and never reconnects', () => {
    const { socket, statuses, current } = setup()
    socket.start()
    current().open()
    current().receive(READY)
    const ws = current()
    socket.stop()
    expect(ws.closed).toBe(true)
    expect(statuses.at(-1)).toBe('disconnected')
    ws.drop() // late event from the old socket
    vi.advanceTimersByTime(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('detects a silently dead connection via the heartbeat and reconnects', () => {
    const { socket, current } = setup()
    socket.start()
    current().open()
    current().receive(READY)
    const first = current()
    vi.advanceTimersByTime(1000) // heartbeat -> ping
    expect(first.sent.map((s) => JSON.parse(s).type)).toEqual(['auth', 'ping'])
    vi.advanceTimersByTime(500) // no pong -> abandon
    expect(first.closed).toBe(true)
    vi.advanceTimersByTime(500) // backoff
    expect(FakeWebSocket.instances).toHaveLength(2)
  })

  it('keeps the connection when pongs arrive', () => {
    const { socket, current } = setup()
    socket.start()
    current().open()
    current().receive(READY)
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(1000) // heartbeat fires: ping sent, pong deadline 500ms away
      current().receive({ type: 'pong', data: { online_players: 1, server_time: 'now' } })
    }
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('reconnects immediately when the browser goes back online', () => {
    const { socket, current } = setup()
    socket.start()
    current().open()
    current().receive(READY)
    current().drop()
    expect(FakeWebSocket.instances).toHaveLength(1)
    window.dispatchEvent(new Event('online'))
    expect(FakeWebSocket.instances).toHaveLength(2) // no waiting for the backoff timer
  })

  it('ignores callbacks from a socket it has already replaced', () => {
    const { socket, events, current } = setup()
    socket.start()
    const stale = current()
    stale.open()
    stale.receive(READY)
    stale.drop()
    vi.advanceTimersByTime(500)
    const before = events.length
    stale.receive({ type: 'presence.updated', data: { online_players: 9 } })
    expect(events.length).toBe(before)
  })
})
