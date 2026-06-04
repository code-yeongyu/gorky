import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import { createApiKey } from "../../src/domain/api-key"
import type { AccountTokenRecord, TokenRefreshResult } from "../../src/domain/types"
import type { GorkyStore } from "../../src/store"
import { createMemoryStore } from "../../src/testing/memory-store"

describe("proxy usage failure route handling", () => {
  it("Given usage persistence fails When chat completions succeeds upstream Then caller receives api error", async () => {
    // Given
    const fixture = await createFixture("usage-failure-chat")
    const logs: unknown[] = []
    const store = failingUsageStore(fixture.account, fixture.apiKey.record)
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_780_000_123_000,
      logger: (event) => {
        logs.push(event)
      },
      upstream: async () => Response.json({ choices: [{ message: { content: "pong" } }] }),
      refreshClient: refreshClient,
    })

    // When
    const response = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": fixture.apiKey.plaintextKey,
      },
      body: JSON.stringify({
        model: "grok-composer-2.5-fast",
        messages: [{ role: "user", content: "ping" }],
      }),
    })
    const body = await response.json()
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(502)
    expect(body).toMatchObject({
      error: {
        type: "gorky_storage_error",
        code: "usage_touch_failed",
      },
    })
    expect(logText).toContain("proxy_request_failed")
    expect(logText).toContain("usage_touch_failed")
    expect(logText).toContain(fixture.apiKey.record.keyPrefix)
    expect(logText).not.toContain(fixture.apiKey.plaintextKey)
    expect(logText).not.toContain("SENSITIVE_USAGE_SENTINEL")
  })

  it("Given usage persistence fails When responses succeeds upstream Then caller receives api error", async () => {
    // Given
    const fixture = await createFixture("usage-failure-responses")
    const logs: unknown[] = []
    const app = createApp({
      store: failingUsageStore(fixture.account, fixture.apiKey.record),
      adminToken: "dev-admin-token",
      now: () => 1_780_000_123_000,
      logger: (event) => {
        logs.push(event)
      },
      upstream: async () => Response.json({ output_text: "pong" }),
      refreshClient: refreshClient,
    })

    // When
    const response = await app.request("/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": fixture.apiKey.plaintextKey,
      },
      body: JSON.stringify({
        model: "grok-composer-2.5-fast",
        input: "ping",
      }),
    })
    const body = await response.json()
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(502)
    expect(body).toMatchObject({
      error: {
        type: "gorky_storage_error",
        code: "usage_touch_failed",
      },
    })
    expect(logText).toContain("proxy_request_failed")
    expect(logText).toContain("usage_touch_failed")
    expect(logText).not.toContain(fixture.apiKey.plaintextKey)
    expect(logText).not.toContain("SENSITIVE_USAGE_SENTINEL")
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

function failingUsageStore(
  account: AccountTokenRecord,
  apiKey: Awaited<ReturnType<typeof createApiKey>>["record"],
): GorkyStore {
  const baseStore = createMemoryStore({ accounts: [account], apiKeys: [apiKey] })
  return {
    ...baseStore,
    touchApiKey: async (): Promise<void> => {
      throw new Error("D1 failed with SENSITIVE_USAGE_SENTINEL")
    },
  } satisfies GorkyStore
}

async function refreshClient(): Promise<TokenRefreshResult> {
  return {
    kind: "success",
    accessToken: "unused",
    refreshToken: null,
    expiresInSeconds: 21_600,
  }
}
