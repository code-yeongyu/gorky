import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import type { AccountTokenRecord, TokenRefreshResult } from "../../src/domain/types"
import { createMemoryStore } from "../../src/testing/memory-store"

describe("admin account enable route", () => {
  it("Given admin auth and a disabled account When enabling it Then the account becomes active without token leaks", async () => {
    // Given
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "SENSITIVE_ACCESS_SENTINEL",
      refreshToken: "SENSITIVE_REFRESH_SENTINEL",
      expiresAt: 1_780_001_000_000,
      modelIds: ["grok-build"],
      status: "disabled",
      lastUsedAt: null,
    }
    const logs: unknown[] = []
    const store = createMemoryStore({ accounts: [account], apiKeys: [] })
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      logger: (event) => {
        logs.push(event)
      },
      upstream: async () => Response.json({ choices: [{ message: { content: "pong" } }] }),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "unused",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
    })

    // When
    const response = await app.request(`/api/admin/accounts/${account.id}/enable`, {
      method: "POST",
      headers: {
        "x-admin-token": "dev-admin-token",
      },
    })
    const text = await response.text()
    const logText = JSON.stringify(logs)

    // Then
    expect(response.status).toBe(200)
    expect(text).toContain(account.id)
    expect(text).toContain('"status":"active"')
    expect(text).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(text).not.toContain("SENSITIVE_REFRESH_SENTINEL")
    expect(store.accounts[0]?.status).toBe("active")
    expect(store.accounts[0]?.refreshToken).toBe(account.refreshToken)
    expect(logText).toContain("admin_account_enabled")
    expect(logText).not.toContain("SENSITIVE_REFRESH_SENTINEL")
  })
})
