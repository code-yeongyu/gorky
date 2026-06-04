import { describe, expect, it } from "vitest"
import { requireAdmin } from "../../src/http/auth"

describe("admin authentication", () => {
  it("Given matching admin token When requiring admin Then the request is allowed", () => {
    // Given
    const headers = new Headers({ "x-admin-token": "dev-admin-token" })

    // When
    const response = requireAdmin(headers, "dev-admin-token")

    // Then
    expect(response).toBeNull()
  })

  it("Given configured admin token is empty When blank token header is sent Then the request is rejected", () => {
    // Given
    const headers = new Headers({ "x-admin-token": "" })

    // When
    const response = requireAdmin(headers, "")

    // Then
    expect(response?.status).toBe(401)
  })
})
