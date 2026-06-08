import { describe, expect, it } from "vitest"
import { z } from "zod"
import { createApp } from "../../src/app"
import type { OAuthStateRecord, OAuthStateStore } from "../../src/domain/oauth"
import type { TokenRefreshResult } from "../../src/domain/types"
import { createMemoryStore } from "../../src/testing/memory-store"

const RegisterStartResponseSchema = z.object({
  authorizationUrl: z.url(),
  state: z.string().min(1),
  redirectUri: z.string().min(1),
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

describe("public account registration routes", () => {
  it("Given no invite code When registration OAuth starts Then a loopback auth URL is returned", async () => {
    // Given
    const stateStore = createMemoryOAuthStateStore()
    const app = createRegistrationApp({ stateStore })

    // When
    const response = await app.request("/api/register-account/oauth/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modelIds: ["grok-build"],
      }),
    })
    const body = RegisterStartResponseSchema.parse(await response.json())
    const saved = stateStore.records.get(body.state)

    // Then
    expect(response.status).toBe(201)
    expect(body.redirectUri).toBe("http://127.0.0.1:8787/callback")
    expect(body.authorizationUrl).toContain("redirect_uri=http%3A%2F%2F127.0.0.1%3A8787%2Fcallback")
    expect(saved?.modelIds).toEqual(["grok-build"])
  })

  it("Given a malformed callback URL When callback is submitted Then registration fails safely", async () => {
    // Given
    const app = createRegistrationApp({ stateStore: createMemoryOAuthStateStore() })

    // When
    const response = await app.request("/api/register-account/oauth/callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        callbackUrl: "https://example.com/callback?code=code_1&state=state_1",
      }),
    })
    const text = await response.text()

    // Then
    expect(response.status).toBe(400)
    expect(text).toContain("unsupported_oauth_callback_url")
  })

  it("Given a pasted localhost callback URL When callback is submitted Then account is stored", async () => {
    // Given
    const store = createMemoryStore({ accounts: [], apiKeys: [] })
    const stateStore = createMemoryOAuthStateStore()
    await stateStore.put(
      "state_1",
      {
        codeVerifier: "verifier_12345678901234567890123456789012",
        redirectUri: "http://127.0.0.1:8787/callback",
        nonce: "nonce_12345678901234567890",
        modelIds: ["grok-build"],
        createdAt: 1_780_000_000_000,
      },
      600,
    )
    const app = createRegistrationApp({
      store,
      stateStore,
      exchangeCode: async (input) => {
        expect(input.code).toBe("code_1")
        expect(input.redirectUri).toBe("http://127.0.0.1:8787/callback")
        return {
          kind: "success",
          accessToken: "SENSITIVE_ACCESS_SENTINEL",
          refreshToken: "SENSITIVE_REFRESH_SENTINEL",
          expiresInSeconds: 21_600,
          email: "register@example.com",
        }
      },
    })

    // When
    const response = await app.request("/api/register-account/oauth/callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        callbackUrl: "http://127.0.0.1:8787/callback?code=code_1&state=state_1",
      }),
    })
    const text = await response.text()

    // Then
    expect(response.status).toBe(201)
    expect(text).toContain("register@example.com")
    expect(text).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(text).not.toContain("SENSITIVE_REFRESH_SENTINEL")
    expect(store.accounts[0]?.email).toBe("register@example.com")
    expect(await stateStore.get("state_1")).toBeNull()
  })
})

function createRegistrationApp(input: {
  readonly store?: ReturnType<typeof createMemoryStore>
  readonly stateStore: OAuthStateStore
  readonly exchangeCode?: NonNullable<
    Parameters<typeof createApp>[0]["oauthAuthorizationClient"]
  >["exchangeCode"]
}): ReturnType<typeof createApp> {
  return createApp({
    store: input.store ?? createMemoryStore({ accounts: [], apiKeys: [] }),
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
    models: ["grok-composer-2.5-fast", "grok-build"],
    oauthStateStore: input.stateStore,
    oauthAuthorizationClient: {
      exchangeCode:
        input.exchangeCode ??
        (async () => ({
          kind: "failure",
          errorCode: "unused",
          message: "unused",
        })),
    },
  })
}
