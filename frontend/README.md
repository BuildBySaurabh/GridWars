# GridWars frontend

React 19 + TypeScript + Vite + Tailwind CSS 4. See the [root README](../README.md) for the full project.

```bash
npm install
cp .env.example .env     # VITE_API_BASE_URL, VITE_WS_URL
npm run dev              # http://localhost:5173
npm test                 # Vitest + Testing Library
npm run typecheck && npm run lint && npm run build
```

Layout: `api/` (typed axios client) · `realtime/` (reconnecting WebSocket client) · `store/` (Zustand) ·
`services/gameController.ts` (every side effect; components stay presentational) · `components/{ui,layout}` (UI kit, shell) · `views/` (Home, Play, Leaderboard, Profile, Settings; hash-routed via `store/uiStore.ts`) · `pages/`.
