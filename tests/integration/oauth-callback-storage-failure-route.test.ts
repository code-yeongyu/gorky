import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import type { OAuthStateRecord, OAuthStateStore } from "../../src/domain/oauth"
import type { TokenRefreshResult } from "../../src/domain/types"
import type { GorkyStore } from "../../src/store"
import { createMemoryStore } from "../../src/testing/memory-store"

function createStateStore(record: OAuthStateRecord): OAuthStateStore {
  const records = new Map([["state_1", record]])
  return {
    put: async (state, nextRecord) => {
      records.set(state, nextRecord)
    },
    get: async (state) => records.get(state) ?? null,
    delete: async (state) => {
      records.delete(state)
    },
  }
}

describe("OAuth callback storage failure route", () => {
  it("Given D1 storage fails When OAuth callback registers an account Then an API error is returned", async () => {
    // Given
    const baseStore = createMemoryStore({ accounts: [], apiKeys: [] })
    const store = {
      ...baseStore,
      saveAccounts: async (): Promise<void> => {
        throw new Error("D1 failed with SENSITIVE_ACCESS_SENTINEL")
      },
    } satisfies GorkyStore
    const logs: unknown[] = []
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_780_000_100_000,
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
      oauthIssuer: "https://auth.x.ai",
      oauthClientId: "client_1",
      oauthStateStore: createStateStore({
        codeVerifier: "verifier_abcdefghijklmnopqrstuvwxyz123456",
        redirectUri: "https://gorky.example.com/api/oauth/callback",
        nonce: "nonce_abcdefghijklmnopqrstuvwxyz",
        modelIds: ["grok-composer-2.5-fast"],
        createdAt: 1_780_000_000_000,
      }),
      oauthAuthorizationClient: {
        exchangeCode: async () => ({
          kind: "success",
          accessToken: "SENSITIVE_ACCESS_SENTINEL",
          refreshToken: "SENSITIVE_REFRESH_SENTINEL",
          expiresInSeconds: 21_600,
          email: "qa@example.com",
        }),
      },
    })

    // When
    const response = await app.request("/api/oauth/callback?state=state_1&code=code_1")
    const text = await response.text()
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(502)
    expect(text).toContain("account_registration_failed")
    expect(logText).toContain("oauth_callback_failed")
    expect(text).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(text).not.toContain("SENSITIVE_REFRESH_SENTINEL")
    expect(logText).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(baseStore.accounts).toHaveLength(0)
  })
})
