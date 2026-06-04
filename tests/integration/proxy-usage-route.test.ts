import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import { createApiKey } from "../../src/domain/api-key"
import type { AccountTokenRecord, TokenRefreshResult } from "../../src/domain/types"
import { createMemoryStore } from "../../src/testing/memory-store"

describe("proxy usage route", () => {
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
