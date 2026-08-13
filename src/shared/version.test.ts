import { describe, expect, it } from 'vitest'
import { isNewerVersion } from './version'

describe('isNewerVersion', () => {
  it('sees a newer release', () => {
    expect(isNewerVersion('0.8.1', '0.8.0')).toBe(true)
    expect(isNewerVersion('0.9.0', '0.8.9')).toBe(true)
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true)
  })

  it('does not offer an update to the same version', () => {
    expect(isNewerVersion('0.8.0', '0.8.0')).toBe(false)
  })

  it('does not offer an update to an older one — the bug this exists for', () => {
    expect(isNewerVersion('0.7.2', '0.8.0')).toBe(false)
    expect(isNewerVersion('0.10.0', '0.9.0')).toBe(true)
    expect(isNewerVersion('0.9.0', '0.10.0')).toBe(false)
  })

  it('compares numerically, not as text', () => {
    // '0.10.0' < '0.9.0' as strings, which is why this is not a string compare
    expect(isNewerVersion('0.10.1', '0.10.0')).toBe(true)
  })

  it('tolerates missing and non-numeric parts', () => {
    expect(isNewerVersion('1.1', '1.0.5')).toBe(true)
    expect(isNewerVersion('1.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('1.0.0-beta', '1.0.0')).toBe(false)
  })
})
