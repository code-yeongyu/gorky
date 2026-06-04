import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import { createApiKey } from "../../src/domain/api-key"
import type { AccountTokenRecord, TokenRefreshResult } from "../../src/domain/types"
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

  it("Given a proxy request When completion is logged Then duration and safe metadata are emitted", async () => {
    // Given
    const apiKey = await createApiKey({
      name: "qa-key",
      allowedModels: ["grok-composer-2.5-fast"],
      now: 1_780_000_000_000,
      secretSeed: "proxy-duration",
    })
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "SENSITIVE_ACCESS_SENTINEL",
      refreshToken: "SENSITIVE_REFRESH_SENTINEL",
      expiresAt: 1_780_001_000_000,
      modelIds: ["grok-composer-2.5-fast"],
      status: "active",
      lastUsedAt: null,
    }
    const times = [1_780_000_000_000, 1_780_000_000_013, 1_780_000_000_021]
    const logs: unknown[] = []
    const app = createApp({
      store: createMemoryStore({ accounts: [account], apiKeys: [apiKey.record] }),
      adminToken: "dev-admin-token",
      now: () => times.shift() ?? 1_780_000_000_021,
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

    // When
    const response = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey.plaintextKey,
      },
      body: JSON.stringify({
        model: "grok-composer-2.5-fast",
        messages: [{ role: "user", content: "SENSITIVE_PROMPT_SENTINEL" }],
      }),
    })
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(200)
    expect(logText).toContain('"durationMs":21')
    expect(logText).toContain(apiKey.record.keyPrefix)
    expect(logText).not.toContain(apiKey.plaintextKey)
    expect(logText).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(logText).not.toContain("SENSITIVE_REFRESH_SENTINEL")
    expect(logText).not.toContain("SENSITIVE_PROMPT_SENTINEL")
  })
})
