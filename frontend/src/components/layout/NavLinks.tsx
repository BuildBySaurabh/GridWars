import { useUiStore } from '../../store/uiStore'
import { NAV_ITEMS } from './nav'

/** The five destinations. Used by both the desktop sidebar and the mobile drawer. */
export function NavLinks() {
  const view = useUiStore((state) => state.view)
  const setView = useUiStore((state) => state.setView)
  return (
    <ul className="space-y-1">
      {NAV_ITEMS.map(({ view: target, label, icon: Icon }) => {
        const active = view === target
        return (
          <li key={target}>
            <button
              type="button"
              onClick={() => setView(target)}
              aria-current={active ? 'page' : undefined}
              className={`flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${
                active
                  ? 'bg-brand/10 text-brand shadow-[inset_3px_0_0_var(--color-brand)]'
                  : 'text-muted hover:bg-white/5 hover:text-fg'
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
