import type { AccountTokenRecord, ApiKeyRecord } from "./domain/types"

export type GorkyStore = {
  readonly listAccounts: () => Promise<readonly AccountTokenRecord[]>
  readonly saveAccount: (account: AccountTokenRecord) => Promise<void>
  readonly saveRefreshedAccount: (account: AccountTokenRecord) => Promise<void>
  readonly saveApiKey: (record: ApiKeyRecord) => Promise<void>
  readonly findApiKeyByHash: (keyHash: string) => Promise<ApiKeyRecord | null>
  readonly touchAccount: (accountId: string, usedAt: number) => Promise<void>
}
