import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import { createApiKey } from "../../src/domain/api-key"
import type { AccountTokenRecord, TokenRefreshResult } from "../../src/domain/types"
import { createMemoryStore } from "../../src/testing/memory-store"

describe("upstream response failure route handling", () => {
  it("Given upstream returns server error When chat completions is called Then caller receives api error", async () => {
    // Given
    const apiKey = await createApiKey({
      name: "qa-key",
      allowedModels: ["grok-composer-2.5-fast"],
      now: 1_780_000_000_000,
      secretSeed: "upstream-server-error",
    })
    const account = createAccount("redacted-access-token", "redacted-refresh-token")
    const store = createMemoryStore({ accounts: [account], apiKeys: [apiKey.record] })
    const logs: unknown[] = []
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_779_999_999_000,
      logger: (event) => {
        logs.push(event)
      },
      upstream: async () =>
        Response.json(
          { error: { message: "server failed with redacted-access-token" } },
          { status: 500 },
        ),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "unused",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
    })

    // When
    const response = await requestChat(app, apiKey.plaintextKey)
    const body = await response.json()
    const text = JSON.stringify(body)
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(502)
    expect(body).toMatchObject({
      error: {
        type: "grok_upstream_error",
        code: "upstream_response_failed",
      },
    })
    expect(store.accounts[0]?.lastUsedAt).toBeNull()
    expect(store.apiKeys[0]?.lastUsedAt).toBeNull()
    expect(logText).toContain("proxy_request_failed")
    expect(logText).toContain("upstream_response_failed")
    expect(text).not.toContain("redacted-access-token")
    expect(logText).not.toContain("redacted-access-token")
    expect(logText).not.toContain(apiKey.plaintextKey)
  })

  it("Given upstream rate limits When chat completions is called Then caller receives rate limit api error", async () => {
    // Given
    const apiKey = await createApiKey({
      name: "qa-key",
      allowedModels: ["grok-composer-2.5-fast"],
      now: 1_780_000_000_000,
      secretSeed: "upstream-rate-limit",
    })
    const account = createAccount("redacted-access-token", "redacted-refresh-token")
    const store = createMemoryStore({ accounts: [account], apiKeys: [apiKey.record] })
    const logs: unknown[] = []
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_779_999_999_000,
      logger: (event) => {
        logs.push(event)
      },
      upstream: async () =>
        Response.json(
          { error: { message: "rate limited with redacted-access-token" } },
          { status: 429 },
        ),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "unused",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
    })

    // When
    const response = await requestChat(app, apiKey.plaintextKey)
    const body = await response.json()
    const text = JSON.stringify(body)
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(429)
    expect(body).toMatchObject({
      error: {
        type: "rate_limit_error",
        code: "upstream_rate_limited",
      },
    })
    expect(store.accounts[0]?.lastUsedAt).toBeNull()
    expect(store.apiKeys[0]?.lastUsedAt).toBeNull()
    expect(logText).toContain("proxy_request_failed")
    expect(logText).toContain("upstream_rate_limited")
    expect(text).not.toContain("redacted-access-token")
    expect(logText).not.toContain("redacted-access-token")
    expect(logText).not.toContain(apiKey.plaintextKey)
  })

  it("Given upstream redirects When chat completions is called Then caller receives api error", async () => {
    // Given
    const apiKey = await createApiKey({
      name: "qa-key",
      allowedModels: ["grok-composer-2.5-fast"],
      now: 1_780_000_000_000,
      secretSeed: "upstream-redirect",
    })
    const account = createAccount("redacted-access-token", "redacted-refresh-token")
    const store = createMemoryStore({ accounts: [account], apiKeys: [apiKey.record] })
    const logs: unknown[] = []
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_779_999_999_000,
      logger: (event) => {
        logs.push(event)
      },
      upstream: async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://accounts.x.ai/redirect-with-token" },
        }),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "unused",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
    })

    // When
    const response = await requestChat(app, apiKey.plaintextKey)
    const body = await response.json()
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(502)
    expect(response.headers.get("location")).toBeNull()
    expect(body).toMatchObject({
      error: {
        type: "grok_upstream_error",
        code: "upstream_response_failed",
      },
    })
    expect(store.accounts[0]?.lastUsedAt).toBeNull()
    expect(store.apiKeys[0]?.lastUsedAt).toBeNull()
    expect(logText).toContain("proxy_request_failed")
    expect(logText).toContain("upstream_response_failed")
    expect(logText).not.toContain("redirect-with-token")
  })
})

function createAccount(accessToken: string, refreshToken: string): AccountTokenRecord {
  return {
    id: "acct_1",
    email: "qa@example.com",
    accessToken,
    refreshToken,
    expiresAt: 1_780_001_000_000,
    modelIds: ["grok-composer-2.5-fast"],
    status: "active",
    lastUsedAt: null,
  }
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
