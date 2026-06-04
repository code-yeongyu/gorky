import { createServer } from "node:http"
import { describe, expect, it } from "vitest"
import { createOAuthAuthorizationClient } from "../../src/cloudflare/oauth-authorization-client"

describe("OAuth authorization client", () => {
  it("Given token response has malformed id token When code is exchanged Then fallback email is used", async () => {
    // Given
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(
        JSON.stringify({
          access_token: "SENSITIVE_ACCESS_SENTINEL",
          refresh_token: "SENSITIVE_REFRESH_SENTINEL",
          expires_in: 21_600,
          id_token: "header.@@@@.signature",
        }),
      )
    })
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === "string") {
      throw new Error("Expected test server TCP address")
    }
    const client = createOAuthAuthorizationClient({
      issuer: `http://127.0.0.1:${address.port}`,
      clientId: "client_1",
    })

    // When
    const result = await client.exchangeCode({
      code: "code_1",
      codeVerifier: "verifier_12345678901234567890123456789012",
      redirectUri: "https://gorky.example.com/api/oauth/callback",
    })
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })

    // Then
    expect(result).toMatchObject({
      kind: "success",
      accessToken: "SENSITIVE_ACCESS_SENTINEL",
      refreshToken: "SENSITIVE_REFRESH_SENTINEL",
      expiresInSeconds: 21_600,
      email: "unknown@gorky.local",
    })
  })
})
