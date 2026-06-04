import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import { createApiKey } from "../../src/domain/api-key"
import type { AccountTokenRecord, TokenRefreshResult } from "../../src/domain/types"
import { createMemoryStore } from "../../src/testing/memory-store"

describe("responses route", () => {
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
})
