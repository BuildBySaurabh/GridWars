/** Shapes shared with the backend REST API and WebSocket contract. */

export interface Player {
  id: string
  username: string
  color: string
}

export interface Cell {
  id: number
  row: number
  column: number
  owner: Player | null
  captured_at: string | null
  /** Incremented by the server on every change; used to discard stale updates. */
  version: number
}

export interface JoinResponse {
  token: string
  token_type: string
  expires_in: number
  player: Player
}

export interface GridSnapshot {
  cells: Cell[]
  server_time: string
}

export interface MeResponse {
  player: Player
  stats: { captured_cells: number; capture_percentage: number; rank: number | null }
}

/** Consistent error envelope returned by every failing endpoint. */
export interface ApiErrorBody {
  error: { code: string; message: string; details: Record<string, unknown> }
}

// ---- WebSocket events (server -> client) -----------------------------------

export interface CellCapturedEvent {
  type: 'cell.captured'
  data: {
    cell_id: number
    row: number
    column: number
    owner: Player
    captured_at: string
    version: number
  }
}

export interface ConnectionReadyEvent {
  type: 'connection.ready'
  data: { player: Player; online_players: number; server_time: string }
}

export interface PresenceUpdatedEvent {
  type: 'presence.updated'
  data: { online_players: number }
}

export interface PongEvent {
  type: 'pong'
  data: { online_players: number; server_time: string }
}

export interface LeaderboardUpdatedEvent {
  type: 'leaderboard.updated'
  data: { entries: unknown[]; stats: unknown }
}

export interface ServerErrorEvent {
  type: 'error'
  data: { code: string; message: string }
}

export type ServerEvent =
  | CellCapturedEvent
  | ConnectionReadyEvent
  | PresenceUpdatedEvent
  | PongEvent
  | LeaderboardUpdatedEvent
  | ServerErrorEvent
