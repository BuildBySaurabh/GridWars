// Live end-to-end check against a RUNNING backend (Postgres + Redis + Daphne). Needs Node 22+ (global WebSocket/fetch).
//   node scripts/live-race-check.mjs
//   GRIDWARS_API=https://api.example.com/api GRIDWARS_WS=wss://api.example.com/ws/grid/ node scripts/live-race-check.mjs
// It creates throwaway guest players (E2E_*) and captures some cells, so don't point it at a game you care about.
// The "foreign Origin" check only means something when the server's CORS_ALLOWED_ORIGINS excludes https://evil.example.
const API = process.env.GRIDWARS_API ?? 'http://127.0.0.1:8000/api'
const WS = process.env.GRIDWARS_WS ?? 'ws://127.0.0.1:8000/ws/grid/'
const N = 12
const results = []
const check = (name, ok, extra = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const suffix = Date.now().toString(36).slice(-5)

async function join(i) {
  const res = await fetch(`${API}/players/join/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: `E2E_${suffix}_${i}`, color: '#22D3EE' }),
  })
  if (res.status !== 201) throw new Error('join failed ' + res.status + await res.text())
  return res.json()
}

function openSocket(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS)
    const state = { ws, events: [], closed: null }
    ws.onmessage = (m) => state.events.push(JSON.parse(m.data))
    ws.onclose = (e) => (state.closed = e.code)
    ws.onerror = () => reject(new Error('ws error'))
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }))
    const t0 = Date.now()
    const poll = setInterval(() => {
      if (state.events.some((e) => e.type === 'connection.ready')) { clearInterval(poll); resolve(state) }
      else if (Date.now() - t0 > 4000) { clearInterval(poll); reject(new Error('no connection.ready')) }
    }, 20)
  })
}

const capture = (token, id) =>
  fetch(`${API}/grid/cells/${id}/capture/`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    .then(async (r) => ({ status: r.status, body: await r.json() }))

const captured = (s, id) => s.events.filter((e) => e.type === 'cell.captured' && e.data.cell_id === id)

// ---------------------------------------------------------------- setup
const players = await Promise.all(Array.from({ length: N }, (_, i) => join(i)))
const sockets = await Promise.all(players.map((p) => openSocket(p.token)))
check(`${N} players joined and ${N} sockets authenticated via first message`, sockets.length === N)
await sleep(300)
const online = sockets[0].events.filter((e) => e.type === 'presence.updated').at(-1)?.data.online_players
check('online player count reflects connected players', online >= N, `online=${online}`)

// ------------------------------------------------ race: everyone, one cell
const raced = await Promise.all(players.map((p) => capture(p.token, 150)))
const wins = raced.filter((r) => r.status === 200)
const conflicts = raced.filter((r) => r.status === 409)
check('race for cell 150: exactly one 200', wins.length === 1, `200s=${wins.length}`)
check('race for cell 150: all others get 409 cell_already_captured', conflicts.length === N - 1 && conflicts.every((r) => r.body.error.code === 'cell_already_captured'))
const winner = wins[0].body.owner.id
await sleep(500)
check('every socket received exactly one cell.captured for 150', sockets.every((s) => captured(s, 150).length === 1), sockets.map((s) => captured(s, 150).length).join(','))
check('every socket saw the same owner (the 200 winner) at version 2', sockets.every((s) => captured(s, 150)[0]?.data.owner.id === winner && captured(s, 150)[0].data.version === 2))
const snap = await (await fetch(`${API}/grid/`, { headers: { Authorization: `Bearer ${players[0].token}` } })).json()
const cell150 = snap.cells.find((c) => c.id === 150)
check('database has exactly one owner, matching the broadcast', cell150.owner?.id === winner && cell150.version === 2)

// ------------------------------------- different cells, all simultaneously
const before = sockets.map((s) => s.events.length)
const spread = await Promise.all(players.map((p, i) => capture(p.token, 200 + i)))
check('simultaneous captures of different cells all succeed', spread.every((r) => r.status === 200), spread.map((r) => r.status).join(','))
await sleep(700)
check('every socket received all 12 distinct capture events', sockets.every((s) => Array.from({ length: N }, (_, i) => captured(s, 200 + i).length).every((n) => n === 1)))
const lbEvents = sockets[0].events.filter((e) => e.type === 'leaderboard.updated')
check('leaderboard.updated broadcast after captures', lbEvents.length >= N, `count=${lbEvents.length}`)
void before

// ----------------------------------------- failed captures are not broadcast
const quiet = sockets[1].events.length
const dup = await capture(players[1].token, 150)
const bad = await capture(players[1].token, 9999)
await sleep(400)
check('failed captures (409 / 404) broadcast nothing', dup.status === 409 && bad.status === 404 && sockets[1].events.length === quiet)

// ------------------------------------------------- disconnect, miss, recover
const victim = sockets[2]
victim.ws.close(); await sleep(200)
const missed = await Promise.all([players[3], players[4]].map((p, i) => capture(p.token, 300 + i)))
check('captures made while a client is offline succeed', missed.every((r) => r.status === 200))
const eventsWhileOffline = victim.events.filter((e) => e.type === 'cell.captured' && e.data.cell_id >= 300 && e.data.cell_id <= 301).length
check('offline client received nothing (as expected)', eventsWhileOffline === 0)
const back = await openSocket(players[2].token)
const resnap = await (await fetch(`${API}/grid/`, { headers: { Authorization: `Bearer ${players[2].token}` } })).json()
check('after reconnect a fresh snapshot contains the missed captures', [300, 301].every((id) => resnap.cells.find((c) => c.id === id).owner !== null))
back.ws.close()

// ---------------------------------------------------------- auth hardening
const bogus = await new Promise((resolve) => {
  const ws = new WebSocket(WS); const ev = []
  ws.onmessage = (m) => ev.push(JSON.parse(m.data))
  ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: 'not-a-jwt' }))
  ws.onclose = (e) => resolve({ code: e.code, ev })
})
check('invalid token: error event then close 4401', bogus.code === 4401 && bogus.ev[0]?.data.code === 'invalid_token', `code=${bogus.code}`)
const urlTok = await new Promise((resolve) => {
  const ws = new WebSocket(`${WS}?token=${players[0].token}`); const ev = []
  ws.onmessage = (m) => ev.push(JSON.parse(m.data))
  setTimeout(() => { ws.close(); resolve(ev) }, 600)
})
check('token in query string does NOT authenticate', !urlTok.some((e) => e.type === 'connection.ready'))
const noauth = await fetch(`${API}/grid/cells/5/capture/`, { method: 'POST' })
check('unauthenticated REST capture -> 401', noauth.status === 401)
const evil = await new Promise((resolve) => {
  const ws = new WebSocket(WS, { headers: { Origin: 'https://evil.example' } })
  ws.onopen = () => resolve('opened'); ws.onerror = () => resolve('refused'); ws.onclose = () => resolve('refused')
})
check('foreign Origin is refused', evil === 'refused', evil)

sockets.forEach((s) => s.ws.close())
const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
