import { NavLinks } from './NavLinks'

export function SideNav() {
  return (
    <nav aria-label="Main" className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-56 shrink-0 border-r border-line bg-surface/60 p-3 lg:block">
      <NavLinks />
    </nav>
  )
}
