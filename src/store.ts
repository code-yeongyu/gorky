import type { AccountTokenRecord, ApiKeyRecord } from "./domain/types"

export type GorkyStore = {
  readonly listAccounts: () => Promise<readonly AccountTokenRecord[]>
  readonly saveAccount: (account: AccountTokenRecord) => Promise<void>
  readonly saveRefreshedAccount: (account: AccountTokenRecord) => Promise<void>
  readonly disableAccount: (accountId: string) => Promise<AccountTokenRecord | null>
  readonly enableAccount: (accountId: string) => Promise<AccountTokenRecord | null>
  readonly saveApiKey: (record: ApiKeyRecord) => Promise<void>
  readonly listApiKeys: () => Promise<readonly ApiKeyRecord[]>
  readonly findApiKeyByHash: (keyHash: string) => Promise<ApiKeyRecord | null>
  readonly revokeApiKey: (keyId: string, revokedAt: number) => Promise<ApiKeyRecord | null>
  readonly touchAccount: (accountId: string, usedAt: number) => Promise<void>
  readonly touchApiKey: (keyHash: string, usedAt: number) => Promise<void>
}
