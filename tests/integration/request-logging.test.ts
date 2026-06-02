import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import { createApiKey } from "../../src/domain/api-key"
import type { TokenRefreshResult } from "../../src/domain/types"
import { createMemoryStore } from "../../src/testing/memory-store"

describe("request logging", () => {
  it("Given an authenticated request When logs are captured Then only key prefix and request metadata are emitted", async () => {
    // Given
    const apiKey = await createApiKey({
      name: "qa-key",
      allowedModels: ["grok-composer-2.5-fast"],
      now: 1_780_000_000_000,
      secretSeed: "logs",
    })
    const logs: unknown[] = []
    const app = createApp({
      store: createMemoryStore({ accounts: [], apiKeys: [apiKey.record] }),
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
    const response = await app.request("/__qa/redaction", {
      headers: {
        Authorization: "Bearer sk-real-looking-secret",
        "x-api-key": apiKey.plaintextKey,
      },
    })
    const body = await response.text()
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(200)
    expect(body).toContain("[REDACTED]")
    expect(logText).toContain(apiKey.record.keyPrefix)
    expect(logText).not.toContain(apiKey.plaintextKey)
    expect(logText).not.toContain("sk-real-looking-secret")
  })
})
