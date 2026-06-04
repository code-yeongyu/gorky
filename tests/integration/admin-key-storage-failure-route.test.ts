import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import type { TokenRefreshResult } from "../../src/domain/types"
import type { GorkyStore } from "../../src/store"
import { createMemoryStore } from "../../src/testing/memory-store"

describe("admin key storage failure route", () => {
  it("Given key storage fails When creating a key Then an API error is returned without plaintext key material", async () => {
    // Given
    const baseStore = createMemoryStore({ accounts: [], apiKeys: [] })
    const store = {
      ...baseStore,
      saveApiKey: async (): Promise<void> => {
        throw new Error("D1 failed while storing SENSITIVE_KEY_SENTINEL")
      },
    } satisfies GorkyStore
    const logs: unknown[] = []
    const app = createApp({
      store,
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
    const response = await app.request("/api/admin/keys", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "dev-admin-token",
      },
      body: JSON.stringify({
        name: "qa-key",
        allowedModels: ["grok-composer-2.5-fast"],
      }),
    })
    const text = await response.text()
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(502)
    expect(text).toContain("key_storage_failed")
    expect(logText).toContain("admin_key_create_failed")
    expect(text).not.toContain("gorky_")
    expect(text).not.toContain("SENSITIVE_KEY_SENTINEL")
    expect(logText).not.toContain("SENSITIVE_KEY_SENTINEL")
    expect(baseStore.apiKeys).toHaveLength(0)
  })
})
