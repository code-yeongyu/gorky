import { describe, expect, it } from "vitest"
import { z } from "zod"
import { createApp } from "../../src/app"
import type { AccountTokenRecord, TokenRefreshResult } from "../../src/domain/types"
import { createMemoryStore } from "../../src/testing/memory-store"

const CreatedKeyResponseSchema = z.object({
  plaintextKey: z.string(),
  keyPrefix: z.string(),
  keyHash: z.string().optional(),
})

describe("admin routes", () => {
  it("Given admin auth When registering an account Then token fields are not returned", async () => {
    // Given
    const store = createMemoryStore({ accounts: [], apiKeys: [] })
    const logs: unknown[] = []
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      logger: (event) => {
        logs.push(event)
      },
      upstream: async () => Response.json({ ok: true }),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "unused",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
    })

    // When
    const response = await app.request("/api/admin/accounts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "dev-admin-token",
      },
      body: JSON.stringify({
        email: "qa@example.com",
        accessToken: "SENSITIVE_ACCESS_SENTINEL",
        refreshToken: "SENSITIVE_REFRESH_SENTINEL",
        expiresAt: 1_780_001_000_000,
        modelIds: ["grok-composer-2.5-fast"],
      }),
    })
    const text = await response.text()
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(201)
    expect(text).toContain("qa@example.com")
    expect(text).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(text).not.toContain("SENSITIVE_REFRESH_SENTINEL")
    expect(logText).toContain("admin_account_registered")
    expect(logText).toContain("acct_")
    expect(logText).not.toContain("qa@example.com")
    expect(logText).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(logText).not.toContain("SENSITIVE_REFRESH_SENTINEL")
    expect(store.accounts).toHaveLength(1)
    expect(store.accounts[0]?.refreshToken).toBe("SENSITIVE_REFRESH_SENTINEL")
  })

  it("Given an unknown model When registering an account Then token material is not stored", async () => {
    // Given
    const store = createMemoryStore({ accounts: [], apiKeys: [] })
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      models: ["grok-build"],
      upstream: async () => Response.json({ ok: true }),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "unused",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
    })

    // When
    const response = await app.request("/api/admin/accounts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "dev-admin-token",
      },
      body: JSON.stringify({
        email: "qa@example.com",
        accessToken: "SENSITIVE_ACCESS_SENTINEL",
        refreshToken: "SENSITIVE_REFRESH_SENTINEL",
        expiresAt: 1_780_001_000_000,
        modelIds: ["grok-unknown"],
      }),
    })
    const text = await response.text()

    // Then
    expect(response.status).toBe(400)
    expect(text).toContain("unknown_model")
    expect(text).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(text).not.toContain("SENSITIVE_REFRESH_SENTINEL")
    expect(store.accounts).toHaveLength(0)
  })

  it("Given admin auth When disabling an account Then it is removed from proxy selection", async () => {
    // Given
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "SENSITIVE_ACCESS_SENTINEL",
      refreshToken: "SENSITIVE_REFRESH_SENTINEL",
      expiresAt: 1_780_001_000_000,
      modelIds: ["grok-build"],
      status: "active",
      lastUsedAt: null,
    }
    const store = createMemoryStore({ accounts: [account], apiKeys: [] })
    const logs: unknown[] = []
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      logger: (event) => {
        logs.push(event)
      },
      upstream: async () => Response.json({ choices: [{ message: { content: "pong" } }] }),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "unused",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
    })
    const created = await app.request("/api/admin/keys", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "dev-admin-token",
      },
      body: JSON.stringify({
        name: "qa-key",
        allowedModels: ["grok-build"],
      }),
    })
    const createdBody = CreatedKeyResponseSchema.parse(await created.json())

    // When
    const disableResponse = await app.request(`/api/admin/accounts/${account.id}/disable`, {
      method: "POST",
      headers: {
        "x-admin-token": "dev-admin-token",
      },
    })
    const disableText = await disableResponse.text()
    const proxyResponse = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": createdBody.plaintextKey,
      },
      body: JSON.stringify({
        model: "grok-build",
        messages: [{ role: "user", content: "ping" }],
      }),
    })
    const proxyBody = await proxyResponse.json()
    const logText = JSON.stringify(logs)

    // Then
    expect(disableResponse.status).toBe(200)
    expect(disableText).toContain(account.id)
    expect(disableText).toContain('"status":"disabled"')
    expect(disableText).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(disableText).not.toContain("SENSITIVE_REFRESH_SENTINEL")
    expect(proxyResponse.status).toBe(503)
    expect(proxyBody).toMatchObject({
      error: {
        code: "model_unavailable",
      },
    })
    expect(logText).toContain("admin_account_disabled")
    expect(logText).not.toContain("SENSITIVE_REFRESH_SENTINEL")
  })

  it("Given admin auth When listing accounts Then token fields are redacted", async () => {
    // Given
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "SENSITIVE_ACCESS_SENTINEL",
      refreshToken: "SENSITIVE_REFRESH_SENTINEL",
      expiresAt: 1_780_000_000_000,
      modelIds: ["grok-composer-2.5-fast", "grok-build"],
      status: "active",
      lastUsedAt: null,
    }
    const app = createApp({
      store: createMemoryStore({ accounts: [account], apiKeys: [] }),
      adminToken: "dev-admin-token",
      now: () => 1_779_999_999_000,
      upstream: async () => Response.json({ ok: true }),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "unused",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
    })

    // When
    const response = await app.request("/api/admin/accounts", {
      headers: {
        "x-admin-token": "dev-admin-token",
      },
    })
    const text = await response.text()

    // Then
    expect(response.status).toBe(200)
    expect(text).toContain("qa@example.com")
    expect(text).toContain("grok-build")
    expect(text).toContain('"principalType":"User"')
    expect(text).toContain('"status":"active"')
    expect(text).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(text).not.toContain("SENSITIVE_REFRESH_SENTINEL")
  })
})
