import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

import { useUiStore } from '../store/uiStore'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  useUiStore.setState({ view: 'play', navOpen: false })
  history.replaceState(null, '', location.pathname)
  document.documentElement.removeAttribute('data-motion')
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
})
