import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import { createApiKey } from "../../src/domain/api-key"
import type { AccountTokenRecord, ApiKeyRecord, TokenRefreshResult } from "../../src/domain/types"
import type { GorkyStore } from "../../src/store"
import { createMemoryStore } from "../../src/testing/memory-store"

describe("proxy store failure route handling", () => {
  it("Given API key lookup fails When chat completions is called Then caller receives api error", async () => {
    // Given
    const fixture = await createFixture("api-key-lookup-failure")
    const logs: unknown[] = []
    const app = createApp({
      store: storeWithFailingApiKeyLookup(fixture.account, fixture.apiKey.record),
      adminToken: "dev-admin-token",
      now: () => 1_780_000_123_000,
      logger: (event) => {
        logs.push(event)
      },
      upstream: async () => Response.json({ unreachable: true }),
      refreshClient: refreshClient,
    })

    // When
    const response = await requestChat(app, fixture.apiKey.plaintextKey)
    const body = await response.json()
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(502)
    expect(body).toMatchObject({
      error: {
        type: "gorky_storage_error",
        code: "api_key_lookup_failed",
      },
    })
    expect(logText).toContain("proxy_request_failed")
    expect(logText).toContain("api_key_lookup_failed")
    expect(logText).not.toContain(fixture.apiKey.plaintextKey)
    expect(logText).not.toContain("SENSITIVE_LOOKUP_SENTINEL")
  })

  it("Given account pool lookup fails When chat completions is called Then caller receives api error", async () => {
    // Given
    const fixture = await createFixture("account-pool-failure")
    const logs: unknown[] = []
    const app = createApp({
      store: storeWithFailingAccountLookup(fixture.account, fixture.apiKey.record),
      adminToken: "dev-admin-token",
      now: () => 1_780_000_123_000,
      logger: (event) => {
        logs.push(event)
      },
      upstream: async () => Response.json({ unreachable: true }),
      refreshClient: refreshClient,
    })

    // When
    const response = await requestChat(app, fixture.apiKey.plaintextKey)
    const body = await response.json()
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(502)
    expect(body).toMatchObject({
      error: {
        type: "gorky_storage_error",
        code: "account_pool_lookup_failed",
      },
    })
    expect(logText).toContain("proxy_request_failed")
    expect(logText).toContain("account_pool_lookup_failed")
    expect(logText).toContain(fixture.apiKey.record.keyPrefix)
    expect(logText).not.toContain(fixture.apiKey.plaintextKey)
    expect(logText).not.toContain("SENSITIVE_ACCOUNT_SENTINEL")
  })
})

async function createFixture(secretSeed: string): Promise<{
  readonly apiKey: Awaited<ReturnType<typeof createApiKey>>
  readonly account: AccountTokenRecord
}> {
  return {
    apiKey: await createApiKey({
      name: "qa-key",
      allowedModels: ["grok-composer-2.5-fast"],
      now: 1_780_000_000_000,
      secretSeed,
    }),
    account: {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "redacted-access-token",
      refreshToken: "redacted-refresh-token",
      expiresAt: 1_780_001_000_000,
      modelIds: ["grok-composer-2.5-fast"],
      status: "active",
      lastUsedAt: null,
    },
  }
}

function storeWithFailingApiKeyLookup(
  account: AccountTokenRecord,
  apiKey: ApiKeyRecord,
): GorkyStore {
  const baseStore = createMemoryStore({ accounts: [account], apiKeys: [apiKey] })
  return {
    ...baseStore,
    findApiKeyByHash: async (): Promise<ApiKeyRecord | null> => {
      throw new Error("D1 failed with SENSITIVE_LOOKUP_SENTINEL")
    },
  } satisfies GorkyStore
}

function storeWithFailingAccountLookup(
  account: AccountTokenRecord,
  apiKey: ApiKeyRecord,
): GorkyStore {
  const baseStore = createMemoryStore({ accounts: [account], apiKeys: [apiKey] })
  return {
    ...baseStore,
    listAccounts: async (): Promise<readonly AccountTokenRecord[]> => {
      throw new Error("D1 failed with SENSITIVE_ACCOUNT_SENTINEL")
    },
  } satisfies GorkyStore
}

async function requestChat(app: ReturnType<typeof createApp>, apiKey: string): Promise<Response> {
  return app.request("/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: "grok-composer-2.5-fast",
      messages: [{ role: "user", content: "ping" }],
    }),
  })
}

async function refreshClient(): Promise<TokenRefreshResult> {
  return {
    kind: "success",
    accessToken: "unused",
    refreshToken: null,
    expiresInSeconds: 21_600,
  }
}
