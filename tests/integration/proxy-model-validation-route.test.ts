import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import { createApiKey } from "../../src/domain/api-key"
import type { AccountTokenRecord, TokenRefreshResult } from "../../src/domain/types"
import { createMemoryStore } from "../../src/testing/memory-store"

describe("proxy model validation", () => {
  it("Given key and account allow an unconfigured model When proxying Then the request is rejected before upstream", async () => {
    // Given
    const apiKey = await createApiKey({
      name: "qa-key",
      allowedModels: ["grok-build"],
      now: 1_780_000_000_000,
      secretSeed: "proxy-model-validation",
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
    let upstreamCalls = 0
    const app = createApp({
      store: createMemoryStore({ accounts: [account], apiKeys: [apiKey.record] }),
      adminToken: "dev-admin-token",
      now: () => 1_779_999_999_000,
      models: ["grok-composer-2.5-fast"],
      upstream: async () => {
        upstreamCalls += 1
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
        model: "grok-build",
        messages: [{ role: "user", content: "ping" }],
      }),
    })
    const body = await response.json()

    // Then
    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      error: {
        type: "invalid_request_error",
        code: "unknown_model",
      },
    })
    expect(upstreamCalls).toBe(0)
  })
})
