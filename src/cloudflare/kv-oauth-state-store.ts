import {
  type OAuthStateRecord,
  OAuthStateRecordSchema,
  type OAuthStateStore,
} from "../domain/oauth"

export function createKvOAuthStateStore(namespace: KVNamespace): OAuthStateStore {
  return {
    put: async (state, record, ttlSeconds) => {
      await namespace.put(stateKey(state), JSON.stringify(record), { expirationTtl: ttlSeconds })
    },
    get: async (state) => {
      const raw = await namespace.get(stateKey(state))
      if (!raw) {
        return null
      }
      return OAuthStateRecordSchema.parse(JSON.parse(raw)) satisfies OAuthStateRecord
    },
    delete: async (state) => {
      await namespace.delete(stateKey(state))
    },
  }
}

function stateKey(state: string): string {
  return `oauth_state:${state}`
}
