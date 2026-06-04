import { describe, expect, it } from "vitest"
import { extractApiKey, getRequestId, requireAdmin } from "../../src/http/auth"

describe("admin authentication", () => {
  it("Given matching admin token When requiring admin Then the request is allowed", () => {
    // Given
    const headers = new Headers({ "x-admin-token": "dev-admin-token" })

    // When
    const response = requireAdmin(headers, "dev-admin-token")

    // Then
    expect(response).toBeNull()
  })

  it("Given configured admin token has whitespace When requiring admin Then the request is allowed", () => {
    // Given
    const headers = new Headers({ "x-admin-token": "dev-admin-token" })

    // When
    const response = requireAdmin(headers, "  dev-admin-token  ")

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

  it("Given lowercase bearer authorization When extracting api key Then the key is accepted", () => {
    // Given
    const headers = new Headers({ Authorization: "bearer  gorky_test_key  " })

    // When
    const apiKey = extractApiKey(headers)

    // Then
    expect(apiKey).toBe("gorky_test_key")
  })

  it("Given copied direct api key has whitespace When extracting api key Then whitespace is ignored", () => {
    // Given
    const headers = new Headers({ "x-api-key": "  gorky_test_key  " })

    // When
    const apiKey = extractApiKey(headers)

    // Then
    expect(apiKey).toBe("gorky_test_key")
  })

  it("Given request id has whitespace When reading request id Then whitespace is ignored", () => {
    // Given
    const headers = new Headers({ "x-request-id": "  req_123  " })

    // When
    const requestId = getRequestId(headers)

    // Then
    expect(requestId).toBe("req_123")
  })

  it("Given request id is blank When reading request id Then a usable id is generated", () => {
    // Given
    const headers = new Headers({ "x-request-id": "   " })

    // When
    const requestId = getRequestId(headers)

    // Then
    expect(requestId.trim().length).toBeGreaterThan(0)
    expect(requestId).not.toBe("   ")
  })
})
