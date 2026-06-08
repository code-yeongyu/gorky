import type { OAuthStateRecord, OAuthStateStore } from "../domain/oauth"

export function createMemoryOAuthStateStore(): OAuthStateStore {
  const store = new Map<string, { record: OAuthStateRecord; expiresAt: number }>()

  return {
    put: async (state, record, ttlSeconds) => {
      store.set(state, { record, expiresAt: Date.now() + ttlSeconds * 1000 })
    },
    get: async (state) => {
      const entry = store.get(state)
      if (!entry) return null
      if (Date.now() > entry.expiresAt) {
        store.delete(state)
        return null
      }
      return entry.record
    },
    delete: async (state) => {
      store.delete(state)
    },
  }
}
