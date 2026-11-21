import type { ServerEvent } from '../api/types'
import { computeBackoff } from './backoff'
import { parseServerEvent } from './events'

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

export interface SocketOptions {
  url: string
  /** Read at connect time so a reconnect always uses the current token. */
  getToken: () => string | null
  onEvent: (event: ServerEvent) => void
  onStatus: (status: ConnectionStatus) => void
  /** The server rejected the token; reconnecting would never help. */
  onAuthFailed: () => void
  createSocket?: (url: string) => WebSocket
  heartbeatIntervalMs?: number
  pongTimeoutMs?: number
  random?: () => number
}

export interface SocketHandle {
  start: () => void
  stop: () => void
}

const OPEN = 1

/**
 * Resilient client for the grid WebSocket.
 *
 * - Authenticates with a first `auth` message (never a URL token).
 * - Reconnects with jittered exponential backoff after any unexpected close.
 * - Detects silently dead connections with a ping/pong heartbeat.
 * - Retries immediately when the browser comes back online / the tab is shown.
 * - Never reconnects after an explicit `stop()` or an authentication failure.
 *
 * `connected` is reported only after the server's `connection.ready`, i.e.
 * once the socket is authenticated and subscribed to broadcasts.
 */
export class GridSocket implements SocketHandle {
  private readonly opts: SocketOptions
  private ws: WebSocket | null = null
  private attempt = 0
  private stopped = true
  private authenticated = false
  private everConnected = false
  private lastErrorCode: string | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private pongTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: SocketOptions) {
    this.opts = options
  }

  start = (): void => {
    if (!this.stopped) return
    this.stopped = false
    this.attempt = 0
    this.everConnected = false
    window.addEventListener('online', this.reconnectNow)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.open()
  }

  stop = (): void => {
    this.stopped = true
    window.removeEventListener('online', this.reconnectNow)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.clearTimers()
    this.detach()
    this.authenticated = false
    this.opts.onStatus('disconnected')
  }

  // ------------------------------------------------------------------ internals
  private open(): void {
    const token = this.opts.getToken()
    if (!token) {
      this.stop()
      this.opts.onAuthFailed()
      return
    }
    this.opts.onStatus(this.everConnected || this.attempt > 0 ? 'reconnecting' : 'connecting')
    this.authenticated = false
    this.lastErrorCode = null

    let ws: WebSocket
    try {
      ws = (this.opts.createSocket ?? ((url: string) => new WebSocket(url)))(this.opts.url)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws
    // Handlers ignore callbacks from sockets we've already replaced or abandoned.
    ws.onopen = () => {
      if (ws === this.ws) ws.send(JSON.stringify({ type: 'auth', token }))
    }
    ws.onmessage = (message: MessageEvent) => {
      if (ws === this.ws) this.handleMessage(message.data)
    }
    ws.onclose = (closeEvent: CloseEvent) => {
      if (ws === this.ws) this.handleClose(closeEvent.code)
    }
    ws.onerror = () => {
      /* a close event always follows; reconnect logic lives there */
    }
  }

  private handleMessage(data: unknown): void {
    this.clearPongTimer() // any inbound traffic proves the connection is alive
    const event = parseServerEvent(data)
    if (!event) {
      console.warn('GridWars: ignored malformed WebSocket message')
      return
    }
    if (event.type === 'connection.ready') {
      this.authenticated = true
      this.attempt = 0
      this.everConnected = true
      this.opts.onStatus('connected')
      this.startHeartbeat()
    } else if (event.type === 'error') {
      this.lastErrorCode = event.data.code
    }
    this.opts.onEvent(event)
  }

  private handleClose(code: number): void {
    this.ws = null
    this.authenticated = false
    this.clearTimers()
    if (this.stopped) return
    if (code === 4401 && this.lastErrorCode === 'invalid_token') {
      this.stop()
      this.opts.onAuthFailed()
      return
    }
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    const delay = computeBackoff(this.attempt, this.opts.random)
    this.attempt += 1
    this.opts.onStatus('reconnecting')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, delay)
  }

  /** Abandon the current socket without waiting for it to close, then retry. */
  private forceReconnect(): void {
    this.clearTimers()
    this.detach()
    this.authenticated = false
    this.scheduleReconnect()
  }

  private readonly reconnectNow = (): void => {
    if (this.stopped || this.authenticated) return
    if (this.ws && this.ws.readyState !== OPEN) return // an attempt is already in flight
    this.clearTimers()
    this.detach()
    this.attempt = 0
    this.open()
  }

  private readonly onVisibility = (): void => {
    if (document.visibilityState !== 'visible') return
    if (this.authenticated) this.sendPing() // quick liveness check after the tab slept
    else this.reconnectNow()
  }

  private startHeartbeat(): void {
    this.clearHeartbeat()
    this.heartbeatTimer = setInterval(() => this.sendPing(), this.opts.heartbeatIntervalMs ?? 20_000)
  }

  private sendPing(): void {
    if (!this.ws || this.ws.readyState !== OPEN || this.pongTimer) return
    this.ws.send(JSON.stringify({ type: 'ping' }))
    this.pongTimer = setTimeout(() => {
      this.pongTimer = null
      this.forceReconnect()
    }, this.opts.pongTimeoutMs ?? 10_000)
  }

  private detach(): void {
    const ws = this.ws
    this.ws = null
    if (!ws) return
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
    try {
      ws.close()
    } catch {
      /* already closed */
    }
  }

  private clearPongTimer(): void {
    if (this.pongTimer) clearTimeout(this.pongTimer)
    this.pongTimer = null
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.clearHeartbeat()
    this.clearPongTimer()
  }
}
