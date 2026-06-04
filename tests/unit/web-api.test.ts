import { afterEach, describe, expect, it, vi } from "vitest"
import { requestJson } from "../../apps/web/src/api"

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
})
