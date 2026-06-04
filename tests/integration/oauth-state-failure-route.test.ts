import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import type { OAuthStateRecord, OAuthStateStore } from "../../src/domain/oauth"
import type { TokenRefreshResult } from "../../src/domain/types"
import { createMemoryStore } from "../../src/testing/memory-store"

const OAUTH_STATE: OAuthStateRecord = {
  codeVerifier: "verifier_abcdefghijklmnopqrstuvwxyz123456",
  redirectUri: "https://gorky.example.com/api/oauth/callback",
  nonce: "nonce_abcdefghijklmnopqrstuvwxyz",
  modelIds: ["grok-composer-2.5-fast"],
  createdAt: 1_780_000_000_000,
}

describe("OAuth state failure routes", () => {
  it("Given OAuth state persistence fails When starting OAuth Then an API error is returned", async () => {
    // Given
    const app = createApp({
      store: createMemoryStore({ accounts: [], apiKeys: [] }),
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      upstream: async () => Response.json({ ok: true }),
      refreshClient: refreshClient,
      oauthIssuer: "https://auth.x.ai",
      oauthClientId: "client_1",
      oauthStateStore: stateStoreWithFailure("put", "SENSITIVE_STATE_PUT_SENTINEL"),
      oauthAuthorizationClient: failingAuthorizationClient,
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
    expect(response.status).toBe(502)
    expect(text).toContain("oauth_state_persist_failed")
    expect(text).not.toContain("SENSITIVE_STATE_PUT_SENTINEL")
  })

  it("Given OAuth state lookup fails When callback runs Then an API error is returned", async () => {
    // Given
    const app = createApp({
      store: createMemoryStore({ accounts: [], apiKeys: [] }),
      adminToken: "dev-admin-token",
      now: () => 1_780_000_100_000,
      upstream: async () => Response.json({ ok: true }),
      refreshClient: refreshClient,
      oauthIssuer: "https://auth.x.ai",
      oauthClientId: "client_1",
      oauthStateStore: stateStoreWithFailure("get", "SENSITIVE_STATE_GET_SENTINEL"),
      oauthAuthorizationClient: failingAuthorizationClient,
    })

    // When
    const response = await app.request("/api/oauth/callback?state=state_1&code=SENSITIVE_CODE")
    const text = await response.text()

    // Then
    expect(response.status).toBe(502)
    expect(text).toContain("oauth_state_lookup_failed")
    expect(text).not.toContain("SENSITIVE_STATE_GET_SENTINEL")
    expect(text).not.toContain("SENSITIVE_CODE")
  })

  it("Given OAuth state deletion fails When callback runs Then an API error is returned", async () => {
    // Given
    const app = createApp({
      store: createMemoryStore({ accounts: [], apiKeys: [] }),
      adminToken: "dev-admin-token",
      now: () => 1_780_000_100_000,
      upstream: async () => Response.json({ ok: true }),
      refreshClient: refreshClient,
      oauthIssuer: "https://auth.x.ai",
      oauthClientId: "client_1",
      oauthStateStore: stateStoreWithFailure("delete", "SENSITIVE_STATE_DELETE_SENTINEL"),
      oauthAuthorizationClient: failingAuthorizationClient,
    })

    // When
    const response = await app.request("/api/oauth/callback?state=state_1&code=SENSITIVE_CODE")
    const text = await response.text()

    // Then
    expect(response.status).toBe(502)
    expect(text).toContain("oauth_state_delete_failed")
    expect(text).not.toContain("SENSITIVE_STATE_DELETE_SENTINEL")
    expect(text).not.toContain("SENSITIVE_CODE")
  })

  it("Given OAuth exchange throws When callback runs Then an API error is returned", async () => {
    // Given
    const app = createApp({
      store: createMemoryStore({ accounts: [], apiKeys: [] }),
      adminToken: "dev-admin-token",
      now: () => 1_780_000_100_000,
      upstream: async () => Response.json({ ok: true }),
      refreshClient: refreshClient,
      oauthIssuer: "https://auth.x.ai",
      oauthClientId: "client_1",
      oauthStateStore: stateStoreWithFailure(null, "unused"),
      oauthAuthorizationClient: {
        exchangeCode: async () => {
          throw new Error("OAuth exchange failed with SENSITIVE_EXCHANGE_SENTINEL")
        },
      },
    })

    // When
    const response = await app.request("/api/oauth/callback?state=state_1&code=SENSITIVE_CODE")
    const text = await response.text()

    // Then
    expect(response.status).toBe(502)
    expect(text).toContain("oauth_exchange_failed")
    expect(text).not.toContain("SENSITIVE_EXCHANGE_SENTINEL")
    expect(text).not.toContain("SENSITIVE_CODE")
  })
})

function stateStoreWithFailure(
  method: "delete" | "get" | "put" | null,
  sentinel: string,
): OAuthStateStore {
  return {
    put: async () => {
      if (method === "put") {
        throw new Error(`KV failed with ${sentinel}`)
      }
    },
    get: async () => {
      if (method === "get") {
        throw new Error(`KV failed with ${sentinel}`)
      }
      return OAUTH_STATE
    },
    delete: async () => {
      if (method === "delete") {
        throw new Error(`KV failed with ${sentinel}`)
      }
    },
  }
}

const failingAuthorizationClient = {
  exchangeCode: async () => ({
    kind: "failure" as const,
    errorCode: "unused",
    message: "unused",
  }),
}

async function refreshClient(): Promise<TokenRefreshResult> {
  return {
    kind: "success",
    accessToken: "unused",
    refreshToken: null,
    expiresInSeconds: 21_600,
  }
}
