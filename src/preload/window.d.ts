import type { DeckApi } from './index'

declare global {
  interface Window {
    api: DeckApi
  }
}

export {}
