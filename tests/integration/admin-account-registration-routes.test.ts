import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import type { TokenRefreshResult } from "../../src/domain/types"
import type { GorkyStore } from "../../src/store"
import { createMemoryStore } from "../../src/testing/memory-store"

describe("admin account registration routes", () => {
  it("Given storage fails When registering an account Then an api error is returned without token material", async () => {
    // Given
    const baseStore = createMemoryStore({ accounts: [], apiKeys: [] })
    const store = {
      ...baseStore,
      saveAccounts: async (): Promise<void> => {
        throw new Error("D1 write failed for SENSITIVE_ACCESS_SENTINEL")
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
    const response = await app.request("/api/admin/accounts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "dev-admin-token",
      },
      body: JSON.stringify({
        email: "qa@example.com",
        accessToken: "SENSITIVE_ACCESS_SENTINEL",
        refreshToken: "SENSITIVE_REFRESH_SENTINEL",
        expiresAt: 1_780_001_000_000,
        modelIds: ["grok-build"],
      }),
    })
    const text = await response.text()
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(502)
    expect(text).toContain("account_registration_failed")
    expect(text).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(text).not.toContain("SENSITIVE_REFRESH_SENTINEL")
    expect(logText).toContain("admin_account_register_failed")
    expect(logText).not.toContain("SENSITIVE_ACCESS_SENTINEL")
  })

  it("Given admin auth and multiple account imports When registering accounts in bulk Then all accounts are stored and redacted", async () => {
    // Given
    const store = createMemoryStore({ accounts: [], apiKeys: [] })
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
    const response = await app.request("/api/admin/accounts/bulk", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "dev-admin-token",
      },
      body: JSON.stringify({
        accounts: [
          {
            email: "first@example.com",
            accessToken: "SENSITIVE_FIRST_ACCESS",
            refreshToken: "SENSITIVE_FIRST_REFRESH",
            expiresAt: 1_780_001_000_000,
            modelIds: ["grok-build"],
          },
          {
            email: "second@example.com",
            accessToken: "SENSITIVE_SECOND_ACCESS",
            refreshToken: "SENSITIVE_SECOND_REFRESH",
            expiresAt: 1_780_002_000_000,
            modelIds: ["grok-composer-2.5-fast"],
          },
        ],
      }),
    })
    const text = await response.text()
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(201)
    expect(text).toContain("first@example.com")
    expect(text).toContain("second@example.com")
    expect(text).not.toContain("SENSITIVE_FIRST_ACCESS")
    expect(text).not.toContain("SENSITIVE_SECOND_REFRESH")
    expect(store.accounts).toHaveLength(2)
    expect(store.accounts.map((account) => account.email)).toEqual([
      "first@example.com",
      "second@example.com",
    ])
    expect(logText).toContain("admin_accounts_registered")
    expect(logText).not.toContain("SENSITIVE_FIRST_ACCESS")
    expect(logText).not.toContain("second@example.com")
  })
})
