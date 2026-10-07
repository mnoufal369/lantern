import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_MODEL } from '@shared/constants'

const stores = vi.hoisted(() => new Map<string, Record<string, unknown>>())

vi.mock('electron', () => ({ safeStorage: {} }))
vi.mock('electron-store', () => ({
  default: class {
    data: Record<string, unknown>
    constructor(opts: { name: string; defaults: Record<string, unknown> }) {
      this.data = structuredClone(opts.defaults)
      stores.set(opts.name, this.data)
    }
    get(key: string): unknown {
      return this.data[key]
    }
    set(key: string, value: unknown): void {
      this.data[key] = value
    }
  }
}))

const { ProfileStore } = await import('./stores')

describe('ProfileStore.seedDefaults', () => {
  it('moves seeded agents off the retired default model, keeping hand-picked ones', () => {
    ProfileStore.seedDefaults()
    const [dev, planner] = ProfileStore.list()
    ProfileStore.save({ ...dev, model: 'claude-sonnet-5' })
    ProfileStore.save({ ...planner, model: 'claude-opus-5-5' })
    // An install seeded before the model refresh.
    stores.get('profiles')!.seedVersion = 3

    ProfileStore.seedDefaults()

    const models = Object.fromEntries(ProfileStore.list().map((p) => [p.id, p.model]))
    expect(models[dev.id]).toBe(DEFAULT_MODEL)
    expect(models[planner.id]).toBe('claude-opus-5-5')
  })
})
