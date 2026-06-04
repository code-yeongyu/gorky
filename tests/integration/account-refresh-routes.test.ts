import { describe, expect, it } from "vitest"
import { z } from "zod"
import { createApp } from "../../src/app"
import type { AccountTokenRecord, TokenRefreshResult } from "../../src/domain/types"
import type { GorkyStore } from "../../src/store"
import { createMemoryStore } from "../../src/testing/memory-store"

const RefreshFailureResponseSchema = z.object({
  error: z.object({
    type: z.literal("grok_refresh_error"),
    code: z.string(),
    message: z.string(),
  }),
})

describe("admin account refresh route", () => {
  it("Given admin auth and an account When forcing refresh Then rotated tokens are stored and redacted", async () => {
    // Given
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "SENSITIVE_OLD_ACCESS",
      refreshToken: "SENSITIVE_OLD_REFRESH",
      expiresAt: 1_780_001_000_000,
      modelIds: ["grok-build"],
      status: "active",
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
      upstream: async () => Response.json({ ok: true }),
      refreshClient: async (refreshToken): Promise<TokenRefreshResult> => {
        expect(refreshToken).toBe("SENSITIVE_OLD_REFRESH")
        return {
          kind: "success",
          accessToken: "SENSITIVE_NEW_ACCESS",
          refreshToken: "SENSITIVE_NEW_REFRESH",
          expiresInSeconds: 21_600,
        }
      },
    })

    // When
    const response = await app.request(`/api/admin/accounts/${account.id}/refresh`, {
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
    expect(text).not.toContain("SENSITIVE_OLD_ACCESS")
    expect(text).not.toContain("SENSITIVE_OLD_REFRESH")
    expect(text).not.toContain("SENSITIVE_NEW_ACCESS")
    expect(text).not.toContain("SENSITIVE_NEW_REFRESH")
    expect(store.accounts[0]?.accessToken).toBe("SENSITIVE_NEW_ACCESS")
    expect(store.accounts[0]?.refreshToken).toBe("SENSITIVE_NEW_REFRESH")
    expect(logText).toContain("admin_account_refreshed")
    expect(logText).not.toContain("SENSITIVE_NEW_REFRESH")
  })

  it("Given refresh failure When forcing refresh Then api error is returned and token material is preserved", async () => {
    // Given
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "SENSITIVE_OLD_ACCESS",
      refreshToken: "SENSITIVE_OLD_REFRESH",
      expiresAt: 1_780_001_000_000,
      modelIds: ["grok-build"],
      status: "active",
      lastUsedAt: null,
    }
    const store = createMemoryStore({ accounts: [account], apiKeys: [] })
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      upstream: async () => Response.json({ ok: true }),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "failure",
        errorCode: "invalid_grant",
        message: "Refresh token is invalid",
      }),
    })

    // When
    const response = await app.request(`/api/admin/accounts/${account.id}/refresh`, {
      method: "POST",
      headers: {
        "x-admin-token": "dev-admin-token",
      },
    })
    const body = RefreshFailureResponseSchema.parse(await response.json())

    // Then
    expect(response.status).toBe(502)
    expect(body.error).toMatchObject({
      code: "invalid_grant",
      message: "Refresh token is invalid",
    })
    expect(store.accounts[0]).toMatchObject({
      accessToken: "SENSITIVE_OLD_ACCESS",
      refreshToken: "SENSITIVE_OLD_REFRESH",
      status: "refresh_failed",
    })
  })

  it("Given refreshed token persistence fails When forcing refresh Then api error is returned", async () => {
    // Given
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "SENSITIVE_OLD_ACCESS",
      refreshToken: "SENSITIVE_OLD_REFRESH",
      expiresAt: 1_780_001_000_000,
      modelIds: ["grok-build"],
      status: "active",
      lastUsedAt: null,
    }
    const baseStore = createMemoryStore({ accounts: [account], apiKeys: [] })
    const store = {
      ...baseStore,
      saveRefreshedAccount: async (): Promise<void> => {
        throw new Error("D1 failed with SENSITIVE_NEW_ACCESS")
      },
    } satisfies GorkyStore
    const app = createApp({
      store,
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      upstream: async () => Response.json({ ok: true }),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "SENSITIVE_NEW_ACCESS",
        refreshToken: "SENSITIVE_NEW_REFRESH",
        expiresInSeconds: 21_600,
      }),
    })

    // When
    const response = await app.request(`/api/admin/accounts/${account.id}/refresh`, {
      method: "POST",
      headers: {
        "x-admin-token": "dev-admin-token",
      },
    })
    const text = await response.text()

    // Then
    expect(response.status).toBe(502)
    expect(text).toContain("account_refresh_persist_failed")
    expect(text).not.toContain("SENSITIVE_NEW_ACCESS")
    expect(text).not.toContain("SENSITIVE_NEW_REFRESH")
    expect(baseStore.accounts[0]).toMatchObject({
      accessToken: "SENSITIVE_OLD_ACCESS",
      refreshToken: "SENSITIVE_OLD_REFRESH",
      status: "active",
    })
  })
})
