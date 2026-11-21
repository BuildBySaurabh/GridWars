import { formatPercent, relativeTime } from '../lib/format'

describe('formatPercent', () => {
  it('keeps up to two decimals and trims trailing zeros', () => {
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(0.16)).toBe('0.16%') // one cell
    expect(formatPercent(0.48)).toBe('0.48%')
    expect(formatPercent(12.8)).toBe('12.8%')
    expect(formatPercent(100)).toBe('100%')
  })
})

describe('relativeTime', () => {
  const now = Date.parse('2026-11-16T12:00:00Z')
  it.each([
    ['2026-11-16T11:59:58Z', 'just now'],
    ['2026-11-16T11:59:30Z', '30s ago'],
    ['2026-11-16T11:55:00Z', '5m ago'],
    ['2026-11-16T09:00:00Z', '3h ago'],
    ['2026-11-14T12:00:00Z', '2d ago'],
  ])('%s -> %s', (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected)
  })
  it('never goes negative for clock skew', () => {
    expect(relativeTime('2026-11-16T12:00:30Z', now)).toBe('just now')
  })
})
