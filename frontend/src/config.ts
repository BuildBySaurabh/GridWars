/**
 * Runtime configuration from Vite env vars (see .env.example).
 *
 * Localhost fallbacks exist for development only. A production build with a
 * missing variable fails loudly instead of silently talking to localhost.
 */
function read(name: 'VITE_API_BASE_URL' | 'VITE_WS_URL', devDefault: string): string {
  const value = import.meta.env[name]?.trim()
  if (value) return value
  if (import.meta.env.DEV) return devDefault
  throw new Error(`Missing required environment variable ${name}`)
}

const wsUrl = read('VITE_WS_URL', 'ws://localhost:8000/ws/grid/')

// Browsers block insecure ws:// from an https:// page (mixed content), and the
// failure is silent from the app's point of view. Fail with a clear message instead.
const isLocalhost = /^wss?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(wsUrl)
if (typeof window !== 'undefined' && window.location.protocol === 'https:' && wsUrl.startsWith('ws://') && !isLocalhost) {
  throw new Error('VITE_WS_URL must use wss:// when the app is served over HTTPS.')
}

export const config = {
  apiBaseUrl: read('VITE_API_BASE_URL', 'http://localhost:8000/api').replace(/\/+$/, ''),
  wsUrl,
} as const
