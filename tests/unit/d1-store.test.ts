import { describe, expect, it } from "vitest"
import { createD1Store } from "../../src/cloudflare/d1-store"
import type { AccountTokenRecord, ApiKeyRecord } from "../../src/domain/types"
import { FakeD1Database } from "../support/fake-d1"

describe("D1 store", () => {
  it("Given account tokens When saving and listing Then ciphertext is stored and plaintext round-trips", async () => {
    // Given
    const db = new FakeD1Database()
    const store = createD1Store(db, "0123456789abcdef0123456789abcdef")
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "SENSITIVE_ACCESS_SENTINEL",
      refreshToken: "SENSITIVE_REFRESH_SENTINEL",
      expiresAt: 1_780_000_000_000,
      modelIds: ["grok-composer-2.5-fast"],
      status: "active",
      lastUsedAt: null,
      priority: 100,
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
    const store = createD1Store(db, "0123456789abcdef0123456789abcdef")
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "SENSITIVE_ACCESS_SENTINEL",
      refreshToken: "SENSITIVE_REFRESH_SENTINEL",
      expiresAt: 1_780_000_000_000,
      modelIds: ["grok-build"],
      status: "active",
      lastUsedAt: null,
      priority: 100,
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

  it("Given accounts When finding one by id Then only that account round-trips", async () => {
    // Given
    const db = new FakeD1Database()
    const store = createD1Store(db, "0123456789abcdef0123456789abcdef")
    const firstAccount: AccountTokenRecord = {
      id: "acct_1",
      email: "first@example.com",
      accessToken: "SENSITIVE_FIRST_ACCESS",
      refreshToken: "SENSITIVE_FIRST_REFRESH",
      expiresAt: 1_780_000_000_000,
      modelIds: ["grok-build"],
      status: "active",
      lastUsedAt: null,
      priority: 100,
    }
    const secondAccount: AccountTokenRecord = {
      id: "acct_2",
      email: "second@example.com",
      accessToken: "SENSITIVE_SECOND_ACCESS",
      refreshToken: "SENSITIVE_SECOND_REFRESH",
      expiresAt: 1_780_000_100_000,
      modelIds: ["grok-composer-2.5-fast"],
      status: "refresh_failed",
      lastUsedAt: 1_780_000_050_000,
      priority: 100,
    }

    // When
    await store.saveAccount(firstAccount)
    await store.saveAccount(secondAccount)
    const found = await store.findAccountById(secondAccount.id)
    const missing = await store.findAccountById("acct_missing")

    // Then
    expect(found).toEqual(secondAccount)
    expect(missing).toBeNull()
  })

  it("Given multiple accounts When saving accounts Then D1 batch stores encrypted rows", async () => {
    // Given
    const db = new FakeD1Database()
    const store = createD1Store(db, "0123456789abcdef0123456789abcdef")
    const accounts: readonly AccountTokenRecord[] = [
      {
        id: "acct_1",
        email: "first@example.com",
        accessToken: "SENSITIVE_FIRST_ACCESS",
        refreshToken: "SENSITIVE_FIRST_REFRESH",
        expiresAt: 1_780_000_000_000,
        modelIds: ["grok-build"],
        status: "active",
        lastUsedAt: null,
        priority: 100,
      },
      {
        id: "acct_2",
        email: "second@example.com",
        accessToken: "SENSITIVE_SECOND_ACCESS",
        refreshToken: "SENSITIVE_SECOND_REFRESH",
        expiresAt: 1_780_000_100_000,
        modelIds: ["grok-composer-2.5-fast"],
        status: "active",
        lastUsedAt: null,
        priority: 100,
      },
    ]

    // When
    await store.saveAccounts(accounts)
    const listed = await store.listAccounts()

    // Then
    expect(db.batchCallCount).toBe(1)
    expect(db.accounts.get("acct_1")?.access_token_ciphertext).not.toBe("SENSITIVE_FIRST_ACCESS")
    expect(db.accounts.get("acct_2")?.refresh_token_ciphertext).not.toBe("SENSITIVE_SECOND_REFRESH")
    expect(listed).toEqual(accounts)
  })

  it("Given routing settings When saving mode and priority Then D1 routing state round-trips", async () => {
    // Given
    const db = new FakeD1Database()
    const store = createD1Store(db, "0123456789abcdef0123456789abcdef")
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "SENSITIVE_ACCESS_SENTINEL",
      refreshToken: "SENSITIVE_REFRESH_SENTINEL",
      expiresAt: 1_780_000_000_000,
      modelIds: ["grok-build"],
      status: "active",
      lastUsedAt: null,
      priority: 100,
    }

    // When
    const defaultRouting = await store.getRoutingConfig()
    await store.saveAccount(account)
    await store.saveRoutingConfig({ mode: "priority" })
    const routing = await store.getRoutingConfig()
    const updated = await store.updateAccountPriority(account.id, 5)

    // Then
    expect(defaultRouting).toEqual({ mode: "round_robin" })
    expect(routing).toEqual({ mode: "priority" })
    expect(updated?.priority).toBe(5)
  })

  it("Given an api key record When saving and listing Then JSON model restrictions round-trip", async () => {
    // Given
    const db = new FakeD1Database()
    const store = createD1Store(db, "0123456789abcdef0123456789abcdef")
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
    const store = createD1Store(db, "0123456789abcdef0123456789abcdef")
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
    const store = createD1Store(db, "0123456789abcdef0123456789abcdef")
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
