import type { OAuthStateRecord, OAuthStateStore } from "../domain/oauth"

export function createMemoryOAuthStateStore(): OAuthStateStore {
  const store = new Map<string, { record: OAuthStateRecord; expiresAt: number }>()
  const deleteExpired = (): void => {
    const now = Date.now()
    for (const [state, entry] of store) {
      if (now > entry.expiresAt) store.delete(state)
    }
  }

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
    resolveSingleActiveState: async () => {
      deleteExpired()
      if (store.size === 0) return { kind: "not_found" }
      if (store.size > 1) return { kind: "ambiguous" }
      const state = store.keys().next().value
      return typeof state === "string" ? { kind: "found", state } : { kind: "not_found" }
    },
  }
}
