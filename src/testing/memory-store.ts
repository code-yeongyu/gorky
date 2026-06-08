import type { AccountTokenRecord, ApiKeyRecord, RoutingConfig } from "../domain/types"
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
  const accounts = input.accounts.map(withDefaultPriority)
  const apiKeys = [...input.apiKeys]
  let routing: RoutingConfig = { mode: "round_robin" }

  return {
    accounts,
    apiKeys,
    listAccounts: async () => accounts,
    findAccountById: async (accountId) => {
      return accounts.find((account) => account.id === accountId) ?? null
    },
    saveAccount: async (account) => {
      accounts.push(withDefaultPriority(account))
    },
    saveAccounts: async (nextAccounts) => {
      accounts.push(...nextAccounts.map(withDefaultPriority))
    },
    saveRefreshedAccount: async (account) => {
      const index = accounts.findIndex((candidate) => candidate.id === account.id)
      const nextAccount = withDefaultPriority(account)
      if (index >= 0) {
        accounts.splice(index, 1, nextAccount)
        return
      }
      accounts.push(nextAccount)
    },
    getRoutingConfig: async () => routing,
    saveRoutingConfig: async (config) => {
      routing = config
    },
    updateAccountPriority: async (accountId, priority) => {
      const index = accounts.findIndex((candidate) => candidate.id === accountId)
      const account = accounts[index]
      if (!account) {
        return null
      }
      const prioritized = { ...account, priority }
      accounts.splice(index, 1, prioritized)
      return prioritized
    },
    disableAccount: async (accountId) => {
      const index = accounts.findIndex((candidate) => candidate.id === accountId)
      const account = accounts[index]
      if (!account) {
        return null
      }
      const disabled = { ...account, status: "disabled" as const }
      accounts.splice(index, 1, disabled)
      return disabled
    },
    enableAccount: async (accountId) => {
      const index = accounts.findIndex((candidate) => candidate.id === accountId)
      const account = accounts[index]
      if (!account) {
        return null
      }
      const enabled = { ...account, status: "active" as const }
      accounts.splice(index, 1, enabled)
      return enabled
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

function withDefaultPriority(account: AccountTokenRecord): AccountTokenRecord {
  return { ...account, priority: account.priority ?? 100 }
}
