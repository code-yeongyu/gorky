import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import type { OAuthStateRecord, OAuthStateStore } from "../../src/domain/oauth"
import type { TokenRefreshResult } from "../../src/domain/types"
import { createMemoryStore } from "../../src/testing/memory-store"

function createMemoryOAuthStateStore(): OAuthStateStore & {
  readonly records: Map<string, OAuthStateRecord>
} {
  const records = new Map<string, OAuthStateRecord>()
  return {
    records,
    put: async (state, record) => {
      records.set(state, record)
    },
    get: async (state) => records.get(state) ?? null,
    delete: async (state) => {
      records.delete(state)
    },
  }
}

describe("OAuth redirect validation routes", () => {
  it("Given a deployed callback redirect URI When OAuth start is requested Then an API error is returned before state is stored", async () => {
    // Given
    const stateStore = createMemoryOAuthStateStore()
    const app = createApp({
      store: createMemoryStore({ accounts: [], apiKeys: [] }),
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      upstream: async () => Response.json({ ok: true }),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "unused",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
      oauthIssuer: "https://auth.x.ai",
      oauthClientId: "client_1",
      oauthStateStore: stateStore,
      oauthAuthorizationClient: {
        exchangeCode: async () => ({
          kind: "failure",
          errorCode: "unused",
          message: "unused",
        }),
      },
    })

    // When
    const response = await app.request("/api/admin/oauth/start", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "dev-admin-token",
      },
      body: JSON.stringify({
        redirectUri: "https://gorky.example.com/api/oauth/callback",
        modelIds: ["grok-composer-2.5-fast"],
      }),
    })
    const text = await response.text()

    // Then
    expect(response.status).toBe(400)
    expect(text).toContain("unsupported_oauth_redirect_uri")
    expect(stateStore.records.size).toBe(0)
  })
})
