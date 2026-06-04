import { describe, expect, it } from "vitest"
import { z } from "zod"
import { createApp } from "../../src/app"
import type { OAuthStateRecord, OAuthStateStore } from "../../src/domain/oauth"
import type { TokenRefreshResult } from "../../src/domain/types"
import { createMemoryStore } from "../../src/testing/memory-store"

const StartResponseSchema = z.object({
  authorizationUrl: z.url(),
  state: z.string().min(1),
})

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

describe("OAuth account registration routes", () => {
  it("Given admin auth When OAuth start is requested Then PKCE state is stored and auth url is returned", async () => {
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
        modelIds: ["grok-build"],
      }),
    })
    const body = StartResponseSchema.parse(await response.json())
    const saved = stateStore.records.get(body.state)

    // Then
    expect(response.status).toBe(201)
    expect(body.authorizationUrl).toContain("https://auth.x.ai/oauth2/authorize")
    expect(body.authorizationUrl).toContain("code_challenge_method=S256")
    expect(saved?.redirectUri).toBe("https://gorky.example.com/api/oauth/callback")
    expect(saved?.modelIds).toEqual(["grok-build"])
  })

  it("Given non-http redirect URI When OAuth start is requested Then state is not stored", async () => {
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
        redirectUri: "javascript:alert(1)",
        modelIds: ["grok-build"],
      }),
    })
    const text = await response.text()

    // Then
    expect(response.status).toBe(400)
    expect(text).toContain("invalid_json")
    expect(stateStore.records.size).toBe(0)
  })

  it("Given saved OAuth state When callback succeeds Then account is stored without returning tokens", async () => {
    // Given
    const store = createMemoryStore({ accounts: [], apiKeys: [] })
    const stateStore = createMemoryOAuthStateStore()
    await stateStore.put(
      "state_1",
      {
        codeVerifier: "verifier_12345678901234567890123456789012",
        redirectUri: "https://gorky.example.com/api/oauth/callback",
        nonce: "nonce_12345678901234567890",
        modelIds: ["grok-build"],
        createdAt: 1_780_000_000_000,
      },
      600,
    )
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_780_000_100_000,
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
        exchangeCode: async (input) => {
          expect(input.code).toBe("code_1")
          expect(input.codeVerifier).toBe("verifier_12345678901234567890123456789012")
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
    expect(response.status).toBe(201)
    expect(text).toContain("qa@example.com")
    expect(text).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(text).not.toContain("SENSITIVE_REFRESH_SENTINEL")
    expect(store.accounts[0]?.email).toBe("qa@example.com")
    expect(store.accounts[0]?.refreshToken).toBe("SENSITIVE_REFRESH_SENTINEL")
    expect(await stateStore.get("state_1")).toBeNull()
  })

  it("Given saved OAuth state When token exchange fails Then an API error and redacted log are emitted", async () => {
    // Given
    const stateStore = createMemoryOAuthStateStore()
    await stateStore.put(
      "state_2",
      {
        codeVerifier: "verifier_abcdefghijklmnopqrstuvwxyz123456",
        redirectUri: "https://gorky.example.com/api/oauth/callback",
        nonce: "nonce_abcdefghijklmnopqrstuvwxyz",
        modelIds: ["grok-build"],
        createdAt: 1_780_000_000_000,
      },
      600,
    )
    const logs: unknown[] = []
    const app = createApp({
      store: createMemoryStore({ accounts: [], apiKeys: [] }),
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
      oauthStateStore: stateStore,
      oauthAuthorizationClient: {
        exchangeCode: async () => ({
          kind: "failure",
          errorCode: "invalid_grant",
          message: "OAuth code rejected with Bearer SENSITIVE_ACCESS_SENTINEL",
        }),
      },
    })

    // When
    const response = await app.request("/api/oauth/callback?state=state_2&code=SENSITIVE_CODE")
    const text = await response.text()
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(502)
    expect(text).toContain("grok_authorization_error")
    expect(text).toContain("invalid_grant")
    expect(logText).toContain("oauth_callback_failed")
    expect(logText).toContain("invalid_grant")
    expect(text).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(logText).not.toContain("SENSITIVE_CODE")
    expect(logText).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(logText).not.toContain("verifier_abcdefghijklmnopqrstuvwxyz123456")
    expect(await stateStore.get("state_2")).toBeNull()
  })
})
