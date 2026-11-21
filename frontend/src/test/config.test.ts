/** config.ts reads import.meta.env at import time, so each case re-imports it fresh. */
async function loadConfig() {
  vi.resetModules()
  return (await import('../config')).config
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('config', () => {
  it('uses the configured URLs and strips a trailing slash from the API base', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api/')
    vi.stubEnv('VITE_WS_URL', 'wss://api.example.com/ws/grid/')
    const config = await loadConfig()
    expect(config.apiBaseUrl).toBe('https://api.example.com/api')
    expect(config.wsUrl).toBe('wss://api.example.com/ws/grid/')
  })

  it('falls back to localhost only in development', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    vi.stubEnv('VITE_WS_URL', '')
    const config = await loadConfig()
    expect(config.apiBaseUrl).toBe('http://localhost:8000/api')
    expect(config.wsUrl).toBe('ws://localhost:8000/ws/grid/')
  })

  it('fails loudly in a production build when a variable is missing', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_API_BASE_URL', '')
    vi.stubEnv('VITE_WS_URL', 'wss://api.example.com/ws/grid/')
    await expect(loadConfig()).rejects.toThrow(/VITE_API_BASE_URL/)
  })

  it('rejects an insecure ws:// URL when the page is served over HTTPS', async () => {
    const original = window.location
    Object.defineProperty(window, 'location', { value: { ...original, protocol: 'https:' }, configurable: true })
    try {
      vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api')
      vi.stubEnv('VITE_WS_URL', 'ws://api.example.com/ws/grid/')
      await expect(loadConfig()).rejects.toThrow(/wss:\/\//)
      vi.stubEnv('VITE_WS_URL', 'ws://localhost:8000/ws/grid/') // local testing over https is still allowed
      await expect(loadConfig()).resolves.toBeDefined()
    } finally {
      Object.defineProperty(window, 'location', { value: original, configurable: true })
    }
  })
})
