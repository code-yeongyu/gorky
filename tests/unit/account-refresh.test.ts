import { describe, expect, it } from "vitest"
import { ensureFreshAccountToken } from "../../src/domain/account-refresh"
import type { AccountTokenRecord, TokenRefreshClient, TokenStore } from "../../src/domain/types"

describe("ensureFreshAccountToken", () => {
  it("Given an expiring account When ensureFreshAccountToken runs Then it rotates and persists tokens", async () => {
    // Given
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: Date.now() + 30_000,
      modelIds: ["grok-composer-2.5-fast"],
      status: "active",
      lastUsedAt: null,
    }
    const writes: AccountTokenRecord[] = []
    const store: TokenStore = {
      saveRefreshedAccount: (nextAccount) => {
        writes.push(nextAccount)
      },
    }
    const client: TokenRefreshClient = {
      refresh: async () => ({
        kind: "success",
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresInSeconds: 21_600,
      }),
    }

    // When
    const result = await ensureFreshAccountToken({
      account,
      client,
      now: Date.now(),
      store,
    })

    // Then
    expect(result.kind).toBe("success")
    expect(result.account.accessToken).toBe("new-access")
    expect(result.account.refreshToken).toBe("new-refresh")
    expect(writes).toHaveLength(1)
    expect(writes[0]?.refreshToken).toBe("new-refresh")
  })

  it("Given a non-expiring account When refresh is forced Then it rotates and persists tokens", async () => {
    // Given
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: Date.now() + 3_600_000,
      modelIds: ["grok-build"],
      status: "active",
      lastUsedAt: null,
    }
    const writes: AccountTokenRecord[] = []
    const store: TokenStore = {
      saveRefreshedAccount: (nextAccount) => {
        writes.push(nextAccount)
      },
    }
    const client: TokenRefreshClient = {
      refresh: async () => ({
        kind: "success",
        accessToken: "forced-access",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
    }

    // When
    const result = await ensureFreshAccountToken({
      account,
      client,
      force: true,
      now: Date.now(),
      store,
    })

    // Then
    expect(result.kind).toBe("success")
    expect(result.account.accessToken).toBe("forced-access")
    expect(result.account.refreshToken).toBe("old-refresh")
    expect(writes).toHaveLength(1)
  })

  it("Given refresh returns invalid_grant When ensureFreshAccountToken runs Then it returns api error and marks account failed", async () => {
    // Given
    const account: AccountTokenRecord = {
      id: "acct_1",
      email: "qa@example.com",
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: Date.now() - 1,
      modelIds: ["grok-composer-2.5-fast"],
      status: "active",
      lastUsedAt: null,
    }
    const writes: AccountTokenRecord[] = []
    const store: TokenStore = {
      saveRefreshedAccount: (nextAccount) => {
        writes.push(nextAccount)
      },
    }
    const client: TokenRefreshClient = {
      refresh: async () => ({
        kind: "failure",
        errorCode: "invalid_grant",
        message: "Refresh token is invalid: Bearer SENSITIVE_ACCESS_SENTINEL",
      }),
    }

    // When
    const result = await ensureFreshAccountToken({
      account,
      client,
      now: Date.now(),
      store,
    })

    // Then
    expect(result.kind).toBe("failure")
    if (result.kind !== "failure") {
      throw new Error("Expected refresh to fail")
    }
    expect(result.error.type).toBe("grok_refresh_error")
    expect(result.error.code).toBe("invalid_grant")
    expect(result.error.message).toContain("[REDACTED]")
    expect(result.error.message).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({
      accessToken: "old-access",
      refreshToken: "old-refresh",
      status: "refresh_failed",
    })
    expect(account.refreshToken).toBe("old-refresh")
  })
})
