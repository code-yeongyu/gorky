import { afterEach, describe, expect, it, vi } from "vitest"
import { registerAccounts, requestJson } from "../../apps/web/src/api"

describe("web api client", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("Given a non-json failure response When requesting json Then a friendly request error is thrown", async () => {
    // Given
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream temporarily unavailable", {
        status: 502,
        headers: { "content-type": "text/plain" },
      }),
    )

    // When
    const promise = requestJson("/api/admin/accounts", {
      method: "GET",
      adminToken: "dev-admin-token",
    })

    // Then
    await expect(promise).rejects.toThrow("Request failed.")
  })

  it("Given multiple manual accounts When registering accounts Then the bulk route is called", async () => {
    // Given
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        accounts: [
          {
            id: "acct_1",
            email: "first@example.com",
            principalType: "User",
            status: "active",
            expiresAt: 1_780_001_000_000,
            modelIds: ["grok-build"],
            lastUsedAt: null,
          },
        ],
      }),
    )

    // When
    const accounts = await registerAccounts("dev-admin-token", [
      {
        email: "first@example.com",
        accessToken: "SENSITIVE_ACCESS_SENTINEL",
        refreshToken: "SENSITIVE_REFRESH_SENTINEL",
        expiresAt: 1_780_001_000_000,
        modelIds: ["grok-build"],
      },
    ])

    // Then
    expect(accounts).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/accounts/bulk",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          accounts: [
            {
              email: "first@example.com",
              accessToken: "SENSITIVE_ACCESS_SENTINEL",
              refreshToken: "SENSITIVE_REFRESH_SENTINEL",
              expiresAt: 1_780_001_000_000,
              modelIds: ["grok-build"],
            },
          ],
        }),
      }),
    )
  })
})
