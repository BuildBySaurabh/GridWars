import type { Player, ServerEvent } from '../api/types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPlayer(value: unknown): value is Player {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.username === 'string' &&
    typeof value.color === 'string'
  )
}

const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value)

/**
 * Validate an untrusted WebSocket payload. Returns null for anything that is
 * not a well-formed, known event, so malformed frames can never reach the store.
 */
export function parseServerEvent(raw: unknown): ServerEvent | null {
  if (typeof raw !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed) || typeof parsed.type !== 'string' || !isRecord(parsed.data)) return null
  const data = parsed.data

  switch (parsed.type) {
    case 'cell.captured':
      if (
        isInt(data.cell_id) &&
        isInt(data.row) &&
        isInt(data.column) &&
        isInt(data.version) &&
        typeof data.captured_at === 'string' &&
        isPlayer(data.owner)
      ) {
        return {
          type: 'cell.captured',
          data: {
            cell_id: data.cell_id,
            row: data.row,
            column: data.column,
            owner: data.owner,
            captured_at: data.captured_at,
            version: data.version,
          },
        }
      }
      return null
    case 'connection.ready':
      if (isPlayer(data.player) && isInt(data.online_players) && typeof data.server_time === 'string') {
        return {
          type: 'connection.ready',
          data: { player: data.player, online_players: data.online_players, server_time: data.server_time },
        }
      }
      return null
    case 'presence.updated':
      return isInt(data.online_players)
        ? { type: 'presence.updated', data: { online_players: data.online_players } }
        : null
    case 'pong':
      return isInt(data.online_players) && typeof data.server_time === 'string'
        ? { type: 'pong', data: { online_players: data.online_players, server_time: data.server_time } }
        : null
    case 'leaderboard.updated':
      return Array.isArray(data.entries)
        ? { type: 'leaderboard.updated', data: { entries: data.entries, stats: data.stats } }
        : null
    case 'error':
      return typeof data.code === 'string' && typeof data.message === 'string'
        ? { type: 'error', data: { code: data.code, message: data.message } }
        : null
    default:
      return null
  }
}
