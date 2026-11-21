import { computeBackoff } from '../realtime/backoff'

describe('computeBackoff', () => {
  it('grows exponentially and stays within [exp/2, exp]', () => {
    expect(computeBackoff(0, () => 1)).toBe(500)
    expect(computeBackoff(1, () => 1)).toBe(1000)
    expect(computeBackoff(2, () => 1)).toBe(2000)
    expect(computeBackoff(0, () => 0)).toBe(250)
    expect(computeBackoff(3, () => 0)).toBe(2000)
  })

  it('is capped', () => {
    expect(computeBackoff(20, () => 1)).toBe(15_000)
    expect(computeBackoff(20, () => 0)).toBe(7_500)
  })

  it('jitters between calls', () => {
    const values = new Set(Array.from({ length: 20 }, () => computeBackoff(4)))
    expect(values.size).toBeGreaterThan(1)
  })
})
