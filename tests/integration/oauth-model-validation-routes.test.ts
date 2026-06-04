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

describe("OAuth model validation routes", () => {
  it("Given an unknown model When OAuth start is requested Then state is not stored", async () => {
    // Given
    const stateStore = createMemoryOAuthStateStore()
    const app = createApp({
      store: createMemoryStore({ accounts: [], apiKeys: [] }),
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
        modelIds: ["grok-unknown"],
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
    expect(stateStore.records.size).toBe(0)
  })

  it("Given saved state has unknown model When callback runs Then token exchange is skipped", async () => {
    // Given
    const store = createMemoryStore({ accounts: [], apiKeys: [] })
    const stateStore = createMemoryOAuthStateStore()
    let exchangeCount = 0
    await stateStore.put(
      "state_1",
      {
        codeVerifier: "verifier_abcdefghijklmnopqrstuvwxyz123456",
        redirectUri: "https://gorky.example.com/api/oauth/callback",
        nonce: "nonce_abcdefghijklmnopqrstuvwxyz",
        modelIds: ["grok-unknown"],
        createdAt: 1_780_000_000_000,
      },
      600,
    )
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_780_000_100_000,
      models: ["grok-build"],
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
        exchangeCode: async () => {
          exchangeCount += 1
          return {
            kind: "success",
            accessToken: "SENSITIVE_ACCESS_SENTINEL",
            refreshToken: "SENSITIVE_REFRESH_SENTINEL",
            expiresInSeconds: 21_600,
            email: "qa@example.com",
          }
        },
      },
    })

    // When
    const response = await app.request("/api/oauth/callback?state=state_1&code=code_1")
    const text = await response.text()

    // Then
    expect(response.status).toBe(400)
    expect(text).toContain("unknown_model")
    expect(text).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(text).not.toContain("SENSITIVE_REFRESH_SENTINEL")
    expect(exchangeCount).toBe(0)
    expect(store.accounts).toHaveLength(0)
    expect(await stateStore.get("state_1")).toBeNull()
  })
})
