# GridWars deployment guide

GridWars has four moving parts. Pick a host for each; they don't have to be the same provider.

| Part | What it needs | In this repo |
|---|---|---|
| **Frontend** | Any static host + HTTPS | `frontend/` → `npm run build` → `dist/` |
| **Backend** | A **long-lived ASGI process with WebSocket support** (not serverless functions) | `backend/` → `sh scripts/start.sh` |
| **PostgreSQL** | Persistent. Source of truth for cell ownership | `DATABASE_URL` |
| **Redis** | Shared by all backend processes. Channel layer, presence, rate-limit counters | `REDIS_URL` |

> **What has and hasn't been verified.** The production settings, `scripts/start.sh`, HTTPS redirect,
> CORS and WebSocket origin checks were exercised against a real Postgres + Redis (see
> [Verification](#verification-after-you-deploy) for the commands). **Not verified:** the Docker
> image build (no Docker daemon was available where this was built) and an actual deployment on any
> hosting provider (no accounts were used). Treat provider-specific steps as a guide, not a tested recipe.

---

## 1. Hosting limits (checked 2026-11-17)

Free tiers change often. These facts were read from each provider's own documentation on the date
above. **Re-check before you rely on them.**

### Render ([docs](https://render.com/docs/free))

- **Free web service:** spins down after **15 minutes without inbound traffic**; waking takes about a minute.
  Render states this *includes WebSocket messages from existing connections*, so a connected GridWars client
  (which sends a heartbeat every 20 s) keeps the service awake, and a new WebSocket connection wakes it.
- 750 free instance hours per workspace per month; when exhausted, free services are suspended until next month.
- Ephemeral filesystem (fine here: GridWars stores nothing on disk).
- The docs do not list WebSockets as unsupported, but they also don't promise them. **Test it** (see below).
- **Free Postgres:** 1 GB, **expires 30 days after creation**, deleted after a further 14-day grace period.
  Don't keep a database you care about there.
- **Free Key Value (Redis-compatible):** in-memory only, wiped on any restart. That is acceptable for GridWars
  because Redis never holds cell ownership (only transient fan-out and presence data).
- Render's own page says: *"Do not use them for production applications."*

### Railway ([docs](https://docs.railway.com/pricing/plans.md))

- Free plan: $1 of credit per month, 1 replica, 0.5 GB RAM. Trial: one-time $5 grant. Hobby: $5/month including $5 of usage.
- If credit runs out, workloads stop. The docs don't spell out what happens to a Trial account when its grant is fully used.

### Neon, PostgreSQL ([docs](https://neon.com/faqs/free-plan-limits-and-quotas))

- Free: 1 GB storage per project, 100 compute-hours/month, 5 GB transfer/month.
- Compute **scales to zero after 5 minutes idle** (cannot be disabled), so the first request after a quiet
  period pays a cold-start delay. The docs page does not state a connection limit.

### Upstash, Redis ([docs](https://upstash.com/docs/redis/overall/billing.md))

- Free: 500K commands/month, 250 MB, 10 GB bandwidth. The page doesn't state pub/sub support or a connection limit.
- ⚠️ **Inference, not documented fact:** `channels_redis` issues commands continuously (blocking receive loops,
  per-message group operations), so a per-command quota may be consumed quickly. Test with realistic traffic before choosing it.

### Fly.io

- The sources I found contradict each other on whether a free allowance exists. **Check
  [fly.io/pricing](https://fly.io/pricing) directly.** Fly runs long-lived processes, so it is technically suited to this app.

### Static hosting for the frontend

Any static host works (the build is plain files; there is no client-side routing, so no rewrite rules are needed).
I did not verify any specific provider's free limits.

### Practical recommendations

| Goal | Suggestion |
|---|---|
| Quick public demo for a reviewer | Static host for the frontend + Render web service + **Neon** Postgres + Render Key Value. Expect a ~1 min cold start after idle and say so in the README you submit. |
| Something that stays up | Paid always-on backend (Railway Hobby, Render paid, Fly) + managed Postgres + managed Redis. |
| No Redis available at all | Not supported in production: `config.settings.prod` refuses to start without `REDIS_URL`. A single-process in-memory layer exists for development only and would silently break real-time updates across processes. |

---

## 2. Environment variables

Full annotated list: [`backend/.env.example`](../backend/.env.example) and [`frontend/.env.example`](../frontend/.env.example).

### Backend (required in production)

| Variable | Example | Notes |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings.prod` | Real env var. `start.sh` and `asgi.py` default to prod. |
| `SECRET_KEY` | *(random, ≥ 32 chars)* | `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `ALLOWED_HOSTS` | `gridwars-api.onrender.com` | Comma-separated host names (no scheme). |
| `DATABASE_URL` | `postgres://user:pass@host:5432/db` | Add `?sslmode=require` if the provider requires TLS. |
| `REDIS_URL` | `rediss://default:pass@host:6379` | `rediss://` for TLS. |
| `CORS_ALLOWED_ORIGINS` | `https://gridwars.example.com` | **Exact** frontend origin(s), no trailing slash. Also the WebSocket origin allow-list. |
| `NUM_PROXIES` | `1` | Number of reverse proxies in front of the app, so rate limits use the real client IP. |
| `SECURE_HSTS_SECONDS` | `31536000` | Set **after** HTTPS is confirmed working (see checklist). |

Optional: `JWT_SIGNING_KEY`, `JWT_ACCESS_TOKEN_LIFETIME_MINUTES`, `THROTTLE_JOIN_RATE`, `THROTTLE_CAPTURE_RATE`,
`WS_AUTH_TIMEOUT_SECONDS`, `PRESENCE_TTL_SECONDS`, `SECURE_SSL_REDIRECT`, `LOG_LEVEL`.

### Frontend (build-time, public)

| Variable | Example |
|---|---|
| `VITE_API_BASE_URL` | `https://gridwars-api.onrender.com/api` |
| `VITE_WS_URL` | `wss://gridwars-api.onrender.com/ws/grid/` |

These are baked into the bundle when you build, so **changing them requires a rebuild**. A production build
without them fails at startup instead of silently using localhost, and `ws://` is rejected on an HTTPS page.

---

## 3. Build and start commands

**Backend** (Python 3.11+; developed on 3.13)

```bash
# build
pip install -r requirements.txt

# start (runs migrations + seeds the 625 cells + serves HTTP and WebSocket)
sh scripts/start.sh
```

`start.sh` is idempotent, so it is safe on every deploy and restart. It runs
`python manage.py migrate --noinput`, `python manage.py seed_grid`, then
`daphne -b 0.0.0.0 -p $PORT --proxy-headers config.asgi:application`.
Health check path: **`/api/health/`** (returns 200, or 503 if the database is unreachable; `degraded` if only Redis is down).
Set the platform's root directory to `backend/`.

A Docker image is provided (`backend/Dockerfile`, same start script) for platforms that build from a Dockerfile.

**Frontend**

```bash
npm ci
npm run build        # output: dist/
```

Root directory `frontend/`, publish directory `dist`.

---

## 4. Deployment order

1. **PostgreSQL**: create the database and copy its connection string.
2. **Redis**: create the instance and copy its URL (`rediss://` if TLS).
3. **Backend**: set the env vars above (use a placeholder `CORS_ALLOWED_ORIGINS` for now), deploy, then open `/api/health/`.
4. **Frontend**: set `VITE_API_BASE_URL` / `VITE_WS_URL` to the backend's public HTTPS/WSS URL, build, publish.
5. **Backend again**: set `CORS_ALLOWED_ORIGINS` to the frontend's real origin and redeploy/restart.
6. Run the verification below.

---

## Verification after you deploy

```bash
API=https://YOUR-BACKEND
curl -s $API/api/health/                       # {"status": "ok", "database": "ok", "channel_layer": "ok"}
curl -sI -H "Origin: https://YOUR-FRONTEND" $API/api/health/ | grep -i access-control-allow-origin
curl -s -o /dev/null -w "%{http_code}\n" $API/api/grid/        # 401 (auth required: the app is reachable)
```

Then in a browser: open the frontend in **two different browsers**, join with different names, and confirm
(a) both show **Live**, (b) a capture in one appears in the other without refreshing, and (c) clicking the same
cell in both at once gives one winner and a "Too slow!" message to the other. If the badge stays on
"Reconnecting…", the host likely isn't passing WebSocket upgrades: check the browser's network tab for the
`/ws/grid/` request, and re-check `CORS_ALLOWED_ORIGINS` (it is also the WebSocket origin allow-list).

### Security checklist

- [ ] `SECRET_KEY` is random, ≥ 32 characters, and not in git.
- [ ] `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` list only your real host/origin.
- [ ] `NUM_PROXIES` matches the number of proxies in front of the app.
- [ ] HTTPS works end to end, **then** set `SECURE_HSTS_SECONDS` (Django's `check --deploy` flags `security.W004` until you do. This is intentional: HSTS is hard to undo, so it is left for you to enable once HTTPS is confirmed).
- [ ] The production database is not a free instance that expires.

---

## Scaling notes

- Run as many Daphne processes as you like: group broadcasts, presence and rate-limit counters all go through Redis.
- PostgreSQL row locks serialise competing captures of the *same* cell; captures of different cells don't block each other.
- Redis outage: captures still succeed (events are best-effort after commit); clients that miss events resync from a
  snapshot when they reconnect. A Postgres outage makes the API return 503.
