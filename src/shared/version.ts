/**
 * True when `candidate` is strictly newer than `current`.
 *
 * Comparing with `!==` looks equivalent and isn't: a build that is *ahead* of
 * the latest published release (a local build, or the machine that just cut the
 * release) would be told an older version is available.
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parts = (v: string): number[] => v.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const a = parts(candidate)
  const b = parts(current)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) {
      return diff > 0
    }
  }
  return false
}
