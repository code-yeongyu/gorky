import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import type { TokenRefreshResult } from "../../src/domain/types"
import { createMemoryStore } from "../../src/testing/memory-store"

describe("security headers", () => {
  it("Given the service responds When health is requested Then browser security headers are present", async () => {
    // Given
    const app = createApp({
      store: createMemoryStore({ accounts: [], apiKeys: [] }),
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
    const response = await app.request("/health")

    // Then
    expect(response.headers.get("content-security-policy") ?? "").toContain("default-src 'self'")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(response.headers.get("strict-transport-security") ?? "").toContain("max-age=31536000")
    expect(response.headers.get("x-frame-options")).toBe("DENY")
    expect(response.headers.get("permissions-policy") ?? "").toContain("camera=()")
  })

  it("Given an API response When admin auth fails Then caching is disabled", async () => {
    // Given
    const app = createApp({
      store: createMemoryStore({ accounts: [], apiKeys: [] }),
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
    const response = await app.request("/api/admin/accounts")

    // Then
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  it("Given QA mode is disabled When a QA route is requested Then it is not exposed", async () => {
    // Given
    const app = createApp({
      store: createMemoryStore({ accounts: [], apiKeys: [] }),
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
    const response = await app.request("/__qa/redaction", {
      headers: {
        Authorization: "Bearer SENSITIVE_QA_SENTINEL",
      },
    })
    const text = await response.text()

    // Then
    expect(response.status).toBe(404)
    expect(text).not.toContain("SENSITIVE_QA_SENTINEL")
  })
})
