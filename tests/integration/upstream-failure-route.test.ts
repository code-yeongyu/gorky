import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import { createApiKey } from "../../src/domain/api-key"
import type { AccountTokenRecord, TokenRefreshResult } from "../../src/domain/types"
import { createMemoryStore } from "../../src/testing/memory-store"

describe("upstream failure route handling", () => {
  it("Given upstream throws When chat completions is called Then caller receives api error", async () => {
    // Given
    const apiKey = await createApiKey({
      name: "qa-key",
      allowedModels: ["grok-build"],
      now: 1_780_000_000_000,
      secretSeed: "upstream-throw",
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
    const logs: unknown[] = []
    const app = createApp({
      store: createMemoryStore({ accounts: [account], apiKeys: [apiKey.record] }),
      adminToken: "dev-admin-token",
      now: () => 1_779_999_999_000,
      logger: (event) => {
        logs.push(event)
      },
      upstream: async () => {
        throw new Error("socket reset from redacted-access-token")
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
        model: "grok-build",
        messages: [{ role: "user", content: "ping" }],
      }),
    })
    const body = await response.json()
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(502)
    expect(body).toMatchObject({
      error: {
        type: "grok_upstream_error",
        code: "upstream_request_failed",
      },
    })
    expect(logText).toContain("proxy_request_failed")
    expect(logText).toContain(apiKey.record.keyPrefix)
    expect(logText).not.toContain(apiKey.plaintextKey)
    expect(logText).not.toContain("redacted-access-token")
    expect(logText).not.toContain("redacted-refresh-token")
  })
})
