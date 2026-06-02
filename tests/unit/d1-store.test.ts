import { describe, expect, it } from "vitest"
import { createD1Store } from "../../src/cloudflare/d1-store"
import type { AccountTokenRecord, ApiKeyRecord } from "../../src/domain/types"

type AccountRow = {
  id: unknown
  email: unknown
  principal_type: unknown
  access_token_ciphertext: unknown
  refresh_token_ciphertext: unknown
  expires_at: unknown
  model_ids: unknown
  status: unknown
  last_used_at: unknown
}

type ApiKeyRow = {
  id: unknown
  key_hash: unknown
  key_prefix: unknown
  name: unknown
  allowed_models: unknown
  created_at: unknown
  last_used_at: unknown
  revoked_at: unknown
  deactivated_at: unknown
}

class FakeD1Database {
  readonly accounts = new Map<string, AccountRow>()
  readonly apiKeys = new Map<string, ApiKeyRow>()

  prepare(sql: string): FakeD1Statement {
    return new FakeD1Statement(this, sql)
  }
}

class FakeD1Statement {
  private bindings: readonly unknown[] = []

  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): FakeD1Statement {
    this.bindings = values
    return this
  }

  async run() {
    if (this.sql.includes("INSERT INTO accounts")) {
      this.db.accounts.set(String(this.bindings[0]), {
        id: this.bindings[0],
        email: this.bindings[1],
        principal_type: this.bindings[2],
        access_token_ciphertext: this.bindings[3],
        refresh_token_ciphertext: this.bindings[4],
        expires_at: this.bindings[5],
        model_ids: this.bindings[6],
        status: this.bindings[7],
        last_used_at: this.bindings[8],
      })
    }

    if (this.sql.includes("UPDATE accounts") && this.sql.includes("last_used_at")) {
      const account = this.db.accounts.get(String(this.bindings[1]))
      if (account) {
        account.last_used_at = this.bindings[0]
      }
    }

    if (this.sql.includes("UPDATE accounts") && this.sql.includes("access_token_ciphertext")) {
      const account = this.db.accounts.get(String(this.bindings[4]))
      if (account) {
        account.access_token_ciphertext = this.bindings[0]
        account.refresh_token_ciphertext = this.bindings[1]
        account.expires_at = this.bindings[2]
        account.status = this.bindings[3]
      }
    }

    if (this.sql.includes("UPDATE accounts") && this.sql.includes("status = ?")) {
      const account = this.db.accounts.get(String(this.bindings[1]))
      if (account) {
        account.status = this.bindings[0]
      }
    }

    if (this.sql.includes("INSERT INTO api_keys")) {
      this.db.apiKeys.set(String(this.bindings[1]), {
        id: this.bindings[0],
        key_hash: this.bindings[1],
        key_prefix: this.bindings[2],
        name: this.bindings[3],
        allowed_models: this.bindings[4],
        created_at: this.bindings[5],
        last_used_at: this.bindings[6],
        revoked_at: this.bindings[7],
        deactivated_at: this.bindings[8],
      })
    }

    if (this.sql.includes("UPDATE api_keys") && this.sql.includes("last_used_at")) {
      const apiKey = this.db.apiKeys.get(String(this.bindings[1]))
      if (apiKey) {
        apiKey.last_used_at = this.bindings[0]
      }
    }

    if (this.sql.includes("UPDATE api_keys") && this.sql.includes("revoked_at")) {
      const apiKey = [...this.db.apiKeys.values()].find(
        (candidate) => candidate.id === this.bindings[1],
      )
      if (apiKey) {
        apiKey.revoked_at = apiKey.revoked_at ?? this.bindings[0]
      }
    }

    return { success: true, meta: {}, results: [] }
  }

  async all() {
    if (this.sql.includes("FROM api_keys")) {
      return { success: true, meta: {}, results: [...this.db.apiKeys.values()] }
    }
    return { success: true, meta: {}, results: [...this.db.accounts.values()] }
  }

  async first(): Promise<AccountRow | ApiKeyRow | null> {
    if (this.sql.includes("FROM accounts") && this.sql.includes("WHERE id")) {
      return this.db.accounts.get(String(this.bindings[0])) ?? null
    }
    if (this.sql.includes("FROM api_keys") && this.sql.includes("WHERE id")) {
      return (
        [...this.db.apiKeys.values()].find((candidate) => candidate.id === this.bindings[0]) ?? null
      )
    }
    return this.db.apiKeys.get(String(this.bindings[0])) ?? null
  }
}

describe("D1 store", () => {
  it("Given account tokens When saving and listing Then ciphertext is stored and plaintext round-trips", async () => {
    // Given
    const db = new FakeD1Database()
    const store = createD1Store(db as unknown as D1Database, "0123456789abcdef0123456789abcdef")
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "SENSITIVE_ACCESS_SENTINEL",
      refreshToken: "SENSITIVE_REFRESH_SENTINEL",
      expiresAt: 1_780_000_000_000,
      modelIds: ["grok-composer-2.5-fast"],
      status: "active",
      lastUsedAt: null,
    }

    // When
    await store.saveAccount(account)
    const storedRow = db.accounts.get(account.id)
    const listed = await store.listAccounts()

    // Then
    expect(storedRow?.access_token_ciphertext).not.toBe(account.accessToken)
    expect(storedRow?.refresh_token_ciphertext).not.toBe(account.refreshToken)
    expect(listed[0]).toEqual(account)
  })

  it("Given an account When disabling Then status round-trips without token loss", async () => {
    // Given
    const db = new FakeD1Database()
    const store = createD1Store(db as unknown as D1Database, "0123456789abcdef0123456789abcdef")
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "SENSITIVE_ACCESS_SENTINEL",
      refreshToken: "SENSITIVE_REFRESH_SENTINEL",
      expiresAt: 1_780_000_000_000,
      modelIds: ["grok-build"],
      status: "active",
      lastUsedAt: null,
    }

    // When
    await store.saveAccount(account)
    const disabled = await store.disableAccount(account.id)

    // Then
    expect(disabled).toMatchObject({
      id: account.id,
      status: "disabled",
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
    })
  })

  it("Given an api key record When saving and listing Then JSON model restrictions round-trip", async () => {
    // Given
    const db = new FakeD1Database()
    const store = createD1Store(db as unknown as D1Database, "0123456789abcdef0123456789abcdef")
    const record: ApiKeyRecord = {
      id: "key_1",
      keyHash: "hash_1",
      keyPrefix: "gorky_123456",
      name: "qa",
      allowedModels: ["grok-build"],
      createdAt: 1_780_000_000_000,
      lastUsedAt: null,
      revokedAt: null,
      deactivatedAt: null,
    }

    // When
    await store.saveApiKey(record)
    const found = await store.findApiKeyByHash(record.keyHash)
    const listed = await store.listApiKeys()

    // Then
    expect(found).toEqual(record)
    expect(listed).toEqual([record])
  })

  it("Given an api key record When touching usage Then last used timestamp round-trips", async () => {
    // Given
    const db = new FakeD1Database()
    const store = createD1Store(db as unknown as D1Database, "0123456789abcdef0123456789abcdef")
    const record: ApiKeyRecord = {
      id: "key_1",
      keyHash: "hash_1",
      keyPrefix: "gorky_123456",
      name: "qa",
      allowedModels: ["grok-build"],
      createdAt: 1_780_000_000_000,
      lastUsedAt: null,
      revokedAt: null,
      deactivatedAt: null,
    }

    // When
    await store.saveApiKey(record)
    await store.touchApiKey(record.keyHash, 1_780_000_123_000)
    const found = await store.findApiKeyByHash(record.keyHash)

    // Then
    expect(found?.lastUsedAt).toBe(1_780_000_123_000)
  })

  it("Given an api key record When revoking Then revoked timestamp round-trips", async () => {
    // Given
    const db = new FakeD1Database()
    const store = createD1Store(db as unknown as D1Database, "0123456789abcdef0123456789abcdef")
    const record: ApiKeyRecord = {
      id: "key_1",
      keyHash: "hash_1",
      keyPrefix: "gorky_123456",
      name: "qa",
      allowedModels: ["grok-build"],
      createdAt: 1_780_000_000_000,
      lastUsedAt: null,
      revokedAt: null,
      deactivatedAt: null,
    }

    // When
    await store.saveApiKey(record)
    const revoked = await store.revokeApiKey(record.id, 1_780_000_456_000)

    // Then
    expect(revoked).toMatchObject({
      id: record.id,
      revokedAt: 1_780_000_456_000,
    })
  })
})
