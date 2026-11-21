import { parseServerEvent } from '../realtime/events'
import { ME } from './factories'

const captured = {
  type: 'cell.captured',
  data: { cell_id: 120, row: 4, column: 19, owner: ME, captured_at: '2026-11-16T12:00:00Z', version: 2 },
}

describe('parseServerEvent', () => {
  it('accepts a well-formed cell.captured event', () => {
    expect(parseServerEvent(JSON.stringify(captured))).toEqual(captured)
  })

  it.each([
    ['non-string', 42],
    ['invalid JSON', '{nope'],
    ['array', '[]'],
    ['no type', '{"data":{}}'],
    ['no data', '{"type":"pong"}'],
    ['unknown type', '{"type":"mystery","data":{}}'],
    ['missing owner', JSON.stringify({ ...captured, data: { ...captured.data, owner: undefined } })],
    ['string version', JSON.stringify({ ...captured, data: { ...captured.data, version: '2' } })],
    ['fractional cell id', JSON.stringify({ ...captured, data: { ...captured.data, cell_id: 1.5 } })],
    ['bad presence', '{"type":"presence.updated","data":{"online_players":"3"}}'],
  ])('rejects %s', (_label, input) => {
    expect(parseServerEvent(input)).toBeNull()
  })

  it('parses the other server events', () => {
    expect(parseServerEvent('{"type":"presence.updated","data":{"online_players":3}}')).toEqual({
      type: 'presence.updated',
      data: { online_players: 3 },
    })
    expect(parseServerEvent('{"type":"error","data":{"code":"invalid_token","message":"x"}}')?.type).toBe('error')
    expect(parseServerEvent('{"type":"leaderboard.updated","data":{"entries":[],"stats":{}}}')?.type).toBe(
      'leaderboard.updated',
    )
  })
})
