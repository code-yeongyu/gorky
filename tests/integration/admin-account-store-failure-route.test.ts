import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import type { AccountTokenRecord, TokenRefreshResult } from "../../src/domain/types"
import type { GorkyStore } from "../../src/store"
import { createMemoryStore } from "../../src/testing/memory-store"

const ACCOUNT: AccountTokenRecord = {
  id: "acct_1",
  email: "qa@example.com",
  accessToken: "SENSITIVE_ACCESS_SENTINEL",
  refreshToken: "SENSITIVE_REFRESH_SENTINEL",
  expiresAt: 1_780_001_000_000,
  modelIds: ["grok-composer-2.5-fast"],
  status: "active",
  lastUsedAt: null,
}

describe("admin account store failure routes", () => {
  it("Given account listing fails When listing accounts Then an API error is returned", async () => {
    // Given
    const app = createApp({
      store: storeWithFailure("listAccounts", "SENSITIVE_LIST_SENTINEL"),
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      upstream: async () => Response.json({ ok: true }),
      refreshClient: refreshClient,
    })

    // When
    const response = await adminRequest(app, "/api/admin/accounts")
    const text = await response.text()

    // Then
    expect(response.status).toBe(502)
    expect(text).toContain("account_list_failed")
    expect(text).not.toContain("SENSITIVE_LIST_SENTINEL")
    expect(text).not.toContain("SENSITIVE_ACCESS_SENTINEL")
  })

  it("Given account disable fails When disabling account Then an API error is returned", async () => {
    // Given
    const app = createApp({
      store: storeWithFailure("disableAccount", "SENSITIVE_DISABLE_SENTINEL"),
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      upstream: async () => Response.json({ ok: true }),
      refreshClient: refreshClient,
    })

    // When
    const response = await adminRequest(app, "/api/admin/accounts/acct_1/disable", "POST")
    const text = await response.text()

    // Then
    expect(response.status).toBe(502)
    expect(text).toContain("account_disable_failed")
    expect(text).not.toContain("SENSITIVE_DISABLE_SENTINEL")
    expect(text).not.toContain("SENSITIVE_ACCESS_SENTINEL")
  })

  it("Given account enable fails When enabling account Then an API error is returned", async () => {
    // Given
    const app = createApp({
      store: storeWithFailure("enableAccount", "SENSITIVE_ENABLE_SENTINEL"),
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      upstream: async () => Response.json({ ok: true }),
      refreshClient: refreshClient,
    })

    // When
    const response = await adminRequest(app, "/api/admin/accounts/acct_1/enable", "POST")
    const text = await response.text()

    // Then
    expect(response.status).toBe(502)
    expect(text).toContain("account_enable_failed")
    expect(text).not.toContain("SENSITIVE_ENABLE_SENTINEL")
    expect(text).not.toContain("SENSITIVE_ACCESS_SENTINEL")
  })

  it("Given refresh account lookup fails When refreshing account Then an API error is returned", async () => {
    // Given
    const app = createApp({
      store: storeWithFailure("findAccountById", "SENSITIVE_FIND_SENTINEL"),
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      upstream: async () => Response.json({ ok: true }),
      refreshClient: refreshClient,
    })

    // When
    const response = await adminRequest(app, "/api/admin/accounts/acct_1/refresh", "POST")
    const text = await response.text()

    // Then
    expect(response.status).toBe(502)
    expect(text).toContain("account_lookup_failed")
    expect(text).not.toContain("SENSITIVE_FIND_SENTINEL")
    expect(text).not.toContain("SENSITIVE_ACCESS_SENTINEL")
  })
})

function storeWithFailure(
  method: "disableAccount" | "enableAccount" | "findAccountById" | "listAccounts",
  sentinel: string,
): GorkyStore {
  const baseStore = createMemoryStore({ accounts: [ACCOUNT], apiKeys: [] })
  return {
    ...baseStore,
    [method]: async () => {
      throw new Error(`D1 failed with ${sentinel}`)
    },
  } satisfies GorkyStore
}

async function adminRequest(
  app: ReturnType<typeof createApp>,
  path: string,
  method = "GET",
): Promise<Response> {
  return app.request(path, {
    method,
    headers: {
      "x-admin-token": "dev-admin-token",
    },
  })
}

async function refreshClient(): Promise<TokenRefreshResult> {
  return {
    kind: "success",
    accessToken: "unused",
    refreshToken: null,
    expiresInSeconds: 21_600,
  }
}
