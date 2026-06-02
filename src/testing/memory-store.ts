import type { AccountTokenRecord, ApiKeyRecord } from "../domain/types"
import type { GorkyStore } from "../store"

type MemoryStoreInput = {
  readonly accounts: readonly AccountTokenRecord[]
  readonly apiKeys: readonly ApiKeyRecord[]
}

export type MemoryStore = GorkyStore & {
  readonly accounts: AccountTokenRecord[]
  readonly apiKeys: ApiKeyRecord[]
}

export function createMemoryStore(input: MemoryStoreInput): MemoryStore {
  const accounts = [...input.accounts]
  const apiKeys = [...input.apiKeys]

  return {
    accounts,
    apiKeys,
    listAccounts: async () => accounts,
    saveAccount: async (account) => {
      accounts.push(account)
    },
    saveRefreshedAccount: async (account) => {
      const index = accounts.findIndex((candidate) => candidate.id === account.id)
      if (index >= 0) {
        accounts.splice(index, 1, account)
        return
      }
      accounts.push(account)
    },
    saveApiKey: async (record) => {
      apiKeys.push(record)
    },
    listApiKeys: async () => apiKeys,
    findApiKeyByHash: async (keyHash) => {
      return apiKeys.find((record) => record.keyHash === keyHash) ?? null
    },
    revokeApiKey: async (keyId, revokedAt) => {
      const index = apiKeys.findIndex((candidate) => candidate.id === keyId)
      const apiKey = apiKeys[index]
      if (!apiKey) {
        return null
      }
      const revoked = { ...apiKey, revokedAt: apiKey.revokedAt ?? revokedAt }
      apiKeys.splice(index, 1, revoked)
      return revoked
    },
    touchAccount: async (accountId, usedAt) => {
      const index = accounts.findIndex((candidate) => candidate.id === accountId)
      const account = accounts[index]
      if (!account) {
        return
      }
      accounts.splice(index, 1, { ...account, lastUsedAt: usedAt })
    },
    touchApiKey: async (keyHash, usedAt) => {
      const index = apiKeys.findIndex((candidate) => candidate.keyHash === keyHash)
      const apiKey = apiKeys[index]
      if (!apiKey) {
        return
      }
      apiKeys.splice(index, 1, { ...apiKey, lastUsedAt: usedAt })
    },
  }
}
