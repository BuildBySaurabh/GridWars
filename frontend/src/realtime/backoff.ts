/**
 * Exponential backoff with "equal jitter": the delay is uniformly random in
 * [exp/2, exp], where exp = min(max, base * 2^attempt). Jitter stops a server
 * restart from being hit by every client at the same instant.
 */
export function computeBackoff(
  attempt: number,
  random: () => number = Math.random,
  baseMs = 500,
  maxMs = 15_000,
): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt))
  return Math.round(exp / 2 + random() * (exp / 2))
}
