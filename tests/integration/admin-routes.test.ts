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

  it("Given admin auth When creating a key Then only prefix is returned and hash is stored", async () => {
    // Given
    const store = createMemoryStore({ accounts: [], apiKeys: [] })
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      upstream: async () => Response.json({ ok: true }),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "unused",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
    })

    // When
    const response = await app.request("/api/admin/keys", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "dev-admin-token",
      },
      body: JSON.stringify({
        name: "qa-key",
        allowedModels: ["grok-composer-2.5-fast"],
      }),
    })
    const body = CreatedKeyResponseSchema.parse(await response.json())

    // Then
    expect(response.status).toBe(201)
    expect(body.plaintextKey).toMatch(/^gorky_/)
    expect(body.keyPrefix).toBe(body.plaintextKey.slice(0, 12))
    expect(body.keyHash).toBeUndefined()
    expect(store.apiKeys).toHaveLength(1)
    expect(store.apiKeys[0]?.keyHash).not.toBe(body.plaintextKey)
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
    expect(text).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(text).not.toContain("SENSITIVE_REFRESH_SENTINEL")
  })
})
