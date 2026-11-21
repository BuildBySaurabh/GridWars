/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** REST API base, e.g. https://api.example.com/api */
  readonly VITE_API_BASE_URL?: string
  /** WebSocket endpoint, e.g. wss://api.example.com/ws/grid/ */
  readonly VITE_WS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
