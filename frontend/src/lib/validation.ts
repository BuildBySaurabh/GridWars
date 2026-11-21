/**
 * Client-side hints only. The server is authoritative and re-validates
 * everything (including reserved and inappropriate names).
 */
const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,19}$/
const HEX_RE = /^#[0-9A-Fa-f]{6}$/

export const PRESET_COLORS = [
  '#8B5CF6',
  '#22D3EE',
  '#34D399',
  '#F472B6',
  '#FBBF24',
  '#60A5FA',
  '#FB7185',
  '#A3E635',
] as const

export function randomPresetColor(random: () => number = Math.random): string {
  return PRESET_COLORS[Math.floor(random() * PRESET_COLORS.length)] ?? PRESET_COLORS[0]
}

export function usernameHint(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Choose a username.'
  if (!USERNAME_RE.test(trimmed)) {
    return '3–20 characters: letters, numbers, _ or -, starting with a letter or number.'
  }
  return null
}

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value)
}
