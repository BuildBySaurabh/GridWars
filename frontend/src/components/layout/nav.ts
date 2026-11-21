import { Gamepad2, House, Settings, Trophy, User, type LucideIcon } from 'lucide-react'

import type { View } from '../../store/uiStore'

export const NAV_ITEMS: { view: View; label: string; icon: LucideIcon }[] = [
  { view: 'home', label: 'Home', icon: House },
  { view: 'play', label: 'Play', icon: Gamepad2 },
  { view: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { view: 'profile', label: 'Profile', icon: User },
  { view: 'settings', label: 'Settings', icon: Settings },
]
