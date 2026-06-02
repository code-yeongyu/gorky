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
    findApiKeyByHash: async (keyHash) => {
      return apiKeys.find((record) => record.keyHash === keyHash) ?? null
    },
    touchAccount: async (accountId, usedAt) => {
      const index = accounts.findIndex((candidate) => candidate.id === accountId)
      const account = accounts[index]
      if (!account) {
        return
      }
      accounts.splice(index, 1, { ...account, lastUsedAt: usedAt })
    },
  }
}
