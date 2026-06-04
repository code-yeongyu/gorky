import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import type { ApiKeyRecord, TokenRefreshResult } from "../../src/domain/types"
import type { GorkyStore } from "../../src/store"
import { createMemoryStore } from "../../src/testing/memory-store"

const API_KEY_RECORD: ApiKeyRecord = {
  id: "key_1",
  keyHash: "hash_1",
  keyPrefix: "gorky_123456",
  name: "qa-key",
  allowedModels: ["grok-composer-2.5-fast"],
  createdAt: 1_780_000_000_000,
  lastUsedAt: null,
  revokedAt: null,
  deactivatedAt: null,
}

describe("admin key store failure routes", () => {
  it("Given key listing fails When listing keys Then an API error is returned", async () => {
    // Given
    const baseStore = createMemoryStore({ accounts: [], apiKeys: [] })
    const store = {
      ...baseStore,
      listApiKeys: async (): Promise<readonly ApiKeyRecord[]> => {
        throw new Error("D1 failed with SENSITIVE_KEY_SENTINEL")
      },
    } satisfies GorkyStore
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      upstream: async () => Response.json({ ok: true }),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "unused",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
    })

    // When
    const response = await app.request("/api/admin/keys", {
      headers: { "x-admin-token": "dev-admin-token" },
    })
    const text = await response.text()

    // Then
    expect(response.status).toBe(502)
    expect(text).toContain("key_list_failed")
    expect(text).not.toContain("SENSITIVE_KEY_SENTINEL")
  })

  it("Given key revocation fails When revoking a key Then an API error is returned", async () => {
    // Given
    const baseStore = createMemoryStore({ accounts: [], apiKeys: [API_KEY_RECORD] })
    const store = {
      ...baseStore,
      revokeApiKey: async (): Promise<ApiKeyRecord | null> => {
        throw new Error("D1 failed with SENSITIVE_KEY_SENTINEL")
      },
    } satisfies GorkyStore
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      upstream: async () => Response.json({ ok: true }),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "unused",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
    })

    // When
    const response = await app.request("/api/admin/keys/key_1/revoke", {
      method: "POST",
      headers: { "x-admin-token": "dev-admin-token" },
    })
    const text = await response.text()

    // Then
    expect(response.status).toBe(502)
    expect(text).toContain("key_revoke_failed")
    expect(text).not.toContain("SENSITIVE_KEY_SENTINEL")
  })
})
