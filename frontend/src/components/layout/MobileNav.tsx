import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { useUiStore } from '../../store/uiStore'
import { Logo } from '../Logo'
import { NavLinks } from './NavLinks'

/** Slide-in menu for < lg screens. Esc / backdrop closes; focus moves in and returns to the opener. */
export function MobileNav() {
  const open = useUiStore((state) => state.navOpen)
  const setOpen = useUiStore((state) => state.setNavOpen)
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    closeButton.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open, setOpen])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        aria-label="Main menu"
        role="dialog"
        aria-modal="true"
        className="drawer-enter absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 border-r border-line bg-surface p-4"
      >
        <div className="flex items-center justify-between">
          <Logo />
          <button
            ref={closeButton}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="grid h-10 w-10 cursor-pointer place-items-center rounded-xl text-muted hover:bg-white/5 hover:text-fg"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Mobile">
          <NavLinks />
        </nav>
      </div>
    </div>
  )
}
