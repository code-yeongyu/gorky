import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import type { TokenRefreshResult } from "../../src/domain/types"
import { createMemoryStore } from "../../src/testing/memory-store"

describe("admin routing routes", () => {
  it("Given admin auth When routing config is read Then round robin is returned by default", async () => {
    // Given
    const app = createRoutingApp()

    // When
    const response = await app.request("/api/admin/routing", {
      headers: { "x-admin-token": "dev-admin-token" },
    })
    const body = await response.json()

    // Then
    expect(response.status).toBe(200)
    expect(body).toEqual({ routing: { mode: "round_robin" } })
  })

  it("Given admin auth When routing mode and account priority are updated Then admin state reflects both", async () => {
    // Given
    const store = createMemoryStore({
      accounts: [
        {
          id: "acct_1",
          email: "one@example.com",
          accessToken: "access",
          refreshToken: "refresh",
          expiresAt: 1_780_001_000_000,
          modelIds: ["grok-build"],
          status: "active",
          lastUsedAt: null,
          priority: 100,
        },
      ],
      apiKeys: [],
    })
    const app = createRoutingApp(store)

    // When
    const configResponse = await app.request("/api/admin/routing", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "dev-admin-token",
      },
      body: JSON.stringify({ mode: "priority" }),
    })
    const accountResponse = await app.request("/api/admin/accounts/acct_1/priority", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "dev-admin-token",
      },
      body: JSON.stringify({ priority: 5 }),
    })

    // Then
    expect(configResponse.status).toBe(200)
    expect(await configResponse.json()).toEqual({ routing: { mode: "priority" } })
    expect(accountResponse.status).toBe(200)
    expect(await accountResponse.json()).toMatchObject({
      account: { id: "acct_1", priority: 5 },
    })
    expect(store.accounts[0]?.priority).toBe(5)
  })

  it("Given a non-admin caller When routing mode is updated Then request is rejected", async () => {
    // Given
    const app = createRoutingApp()

    // When
    const response = await app.request("/api/admin/routing", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "priority" }),
    })
    const text = await response.text()

    // Then
    expect(response.status).toBe(401)
    expect(text).toContain("invalid_admin_token")
  })
})

function createRoutingApp(store = createMemoryStore({ accounts: [], apiKeys: [] })) {
  return createApp({
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
}
