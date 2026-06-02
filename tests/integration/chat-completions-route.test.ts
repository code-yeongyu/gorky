import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import { createApiKey } from "../../src/domain/api-key"
import type { AccountTokenRecord, TokenRefreshResult } from "../../src/domain/types"
import { createMemoryStore } from "../../src/testing/memory-store"

describe("chat completions route", () => {
  it("Given a valid gorky key When chat completions is called Then it forwards with Grok headers", async () => {
    // Given
    const apiKey = await createApiKey({
      name: "qa-key",
      allowedModels: ["grok-composer-2.5-fast"],
      now: 1_780_000_000_000,
      secretSeed: "chat-route",
    })
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "redacted-access-token",
      refreshToken: "redacted-refresh-token",
      expiresAt: 1_780_001_000_000,
      modelIds: ["grok-composer-2.5-fast"],
      status: "active",
      lastUsedAt: null,
    }
    const captures: { readonly url: string; readonly headers: Headers; readonly body: string }[] =
      []
    const app = createApp({
      store: createMemoryStore({ accounts: [account], apiKeys: [apiKey.record] }),
      adminToken: "dev-admin-token",
      now: () => 1_779_999_999_000,
      upstream: async (request) => {
        captures.push({
          url: request.url,
          headers: request.headers,
          body: await request.text(),
        })
        return Response.json({ choices: [{ message: { content: "pong" } }] })
      },
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "unused",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
    })

    // When
    const response = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey.plaintextKey,
      },
      body: JSON.stringify({
        model: "grok-composer-2.5-fast",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 8,
      }),
    })

    // Then
    expect(response.status).toBe(200)
    expect(captures).toHaveLength(1)
    expect(captures[0]?.url).toBe("https://cli-chat-proxy.grok.com/v1/chat/completions")
    expect(captures[0]?.headers.get("Authorization")).toBe("Bearer redacted-access-token")
    expect(captures[0]?.headers.get("X-XAI-Token-Auth")).toBe("xai-grok-cli")
    expect(captures[0]?.headers.get("x-grok-client-version")).toBe("0.2.16")
    expect(captures[0]?.headers.get("x-grok-model-override")).toBe("grok-composer-2.5-fast")
    expect(captures[0]?.body).toContain("grok-composer-2.5-fast")
  })

  it("Given refresh fails When chat completions is called Then caller receives upstream auth api error", async () => {
    // Given
    const apiKey = await createApiKey({
      name: "qa-key",
      allowedModels: ["grok-composer-2.5-fast"],
      now: 1_780_000_000_000,
      secretSeed: "refresh-fail",
    })
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "expired-access-token",
      refreshToken: "must-remain",
      expiresAt: 1_779_999_000_000,
      modelIds: ["grok-composer-2.5-fast"],
      status: "active",
      lastUsedAt: null,
    }
    const store = createMemoryStore({ accounts: [account], apiKeys: [apiKey.record] })
    const logs: unknown[] = []
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      logger: (event) => {
        logs.push(event)
      },
      upstream: async () => Response.json({ unreachable: true }),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "failure",
        errorCode: "invalid_grant",
        message: "Refresh token rejected",
      }),
    })

    // When
    const response = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey.plaintextKey,
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
        type: "grok_refresh_error",
        code: "invalid_grant",
      },
    })
    expect(logText).toContain("proxy_request_failed")
    expect(logText).toContain("invalid_grant")
    expect(logText).toContain(apiKey.record.keyPrefix)
    expect(logText).not.toContain(apiKey.plaintextKey)
    expect(logText).not.toContain("must-remain")
    expect(store.accounts[0]?.refreshToken).toBe("must-remain")
  })

  it("Given upstream rejects a fresh-looking token When chat completions is called Then it refreshes and retries once", async () => {
    // Given
    const apiKey = await createApiKey({
      name: "qa-key",
      allowedModels: ["grok-build"],
      now: 1_780_000_000_000,
      secretSeed: "auth-retry",
    })
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "stale-access-token",
      refreshToken: "refresh-sentinel",
      expiresAt: 1_780_100_000_000,
      modelIds: ["grok-build"],
      status: "active",
      lastUsedAt: null,
    }
    const store = createMemoryStore({ accounts: [account], apiKeys: [apiKey.record] })
    const captures: { readonly authorization: string | null }[] = []
    const logs: unknown[] = []
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      logger: (event) => {
        logs.push(event)
      },
      upstream: async (request) => {
        captures.push({ authorization: request.headers.get("Authorization") })
        if (captures.length === 1) {
          return Response.json({ error: { code: "unauthorized" } }, { status: 401 })
        }
        return Response.json({ choices: [{ message: { content: "pong" } }] })
      },
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        expiresInSeconds: 21_600,
      }),
    })

    // When
    const response = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey.plaintextKey,
      },
      body: JSON.stringify({
        model: "grok-build",
        messages: [{ role: "user", content: "ping" }],
      }),
    })
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(200)
    expect(captures).toEqual([
      { authorization: "Bearer stale-access-token" },
      { authorization: "Bearer new-access-token" },
    ])
    expect(store.accounts[0]).toMatchObject({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      status: "active",
      lastUsedAt: 1_780_000_000_000,
    })
    expect(logText).toContain("upstream_auth_retry")
    expect(logText).not.toContain("refresh-sentinel")
    expect(logText).not.toContain("new-refresh-token")
  })

  it("Given no API key When chat completions is called Then authentication failure is logged without secrets", async () => {
    // Given
    const logs: unknown[] = []
    const app = createApp({
      store: createMemoryStore({ accounts: [], apiKeys: [] }),
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      logger: (event) => {
        logs.push(event)
      },
      upstream: async () => Response.json({ unreachable: true }),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "unused",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
    })

    // When
    const response = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-build",
        messages: [{ role: "user", content: "ping" }],
      }),
    })
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(401)
    expect(logText).toContain("proxy_request_failed")
    expect(logText).toContain("missing_api_key")
    expect(logText).toContain("grok-build")
    expect(logText).not.toContain("ping")
  })

  it("Given a valid gorky key When responses is called Then it forwards without Grok CLI header", async () => {
    // Given
    const apiKey = await createApiKey({
      name: "qa-key",
      allowedModels: ["grok-composer-2.5-fast"],
      now: 1_780_000_000_000,
      secretSeed: "responses-route",
    })
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "redacted-access-token",
      refreshToken: "redacted-refresh-token",
      expiresAt: 1_780_001_000_000,
      modelIds: ["grok-composer-2.5-fast"],
      status: "active",
      lastUsedAt: null,
    }
    const captures: { readonly url: string; readonly headers: Headers; readonly body: string }[] =
      []
    const app = createApp({
      store: createMemoryStore({ accounts: [account], apiKeys: [apiKey.record] }),
      adminToken: "dev-admin-token",
      now: () => 1_779_999_999_000,
      upstream: async (request) => {
        captures.push({
          url: request.url,
          headers: request.headers,
          body: await request.text(),
        })
        return Response.json({ output_text: "pong" })
      },
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "unused",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
    })

    // When
    const response = await app.request("/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey.plaintextKey,
      },
      body: JSON.stringify({
        model: "grok-composer-2.5-fast",
        input: "ping",
      }),
    })

    // Then
    expect(response.status).toBe(200)
    expect(captures[0]?.url).toBe("https://api.x.ai/v1/responses")
    expect(captures[0]?.headers.get("Authorization")).toBe("Bearer redacted-access-token")
    expect(captures[0]?.headers.get("x-grok-client-version")).toBeNull()
  })

  it("Given a valid gorky key When proxy request succeeds Then account and key usage timestamps are stored", async () => {
    // Given
    const apiKey = await createApiKey({
      name: "qa-key",
      allowedModels: ["grok-build"],
      now: 1_780_000_000_000,
      secretSeed: "usage-timestamps",
    })
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "redacted-access-token",
      refreshToken: "redacted-refresh-token",
      expiresAt: 1_780_001_000_000,
      modelIds: ["grok-build"],
      status: "active",
      lastUsedAt: null,
    }
    const store = createMemoryStore({ accounts: [account], apiKeys: [apiKey.record] })
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_780_000_123_000,
      upstream: async () => Response.json({ choices: [{ message: { content: "pong" } }] }),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "unused",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
    })

    // When
    const response = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey.plaintextKey,
      },
      body: JSON.stringify({
        model: "grok-build",
        messages: [{ role: "user", content: "ping" }],
      }),
    })

    // Then
    expect(response.status).toBe(200)
    expect(store.accounts[0]?.lastUsedAt).toBe(1_780_000_123_000)
    expect(store.apiKeys[0]?.lastUsedAt).toBe(1_780_000_123_000)
  })
})
