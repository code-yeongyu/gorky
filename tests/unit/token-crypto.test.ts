import { describe, expect, it } from "vitest"
import { decryptToken, encryptToken } from "../../src/lib/token-crypto"

describe("token crypto", () => {
  it("Given token material When encrypted Then ciphertext decrypts and does not contain plaintext", async () => {
    // Given
    const secret = "test-secret-with-enough-entropy"
    const token = "SENSITIVE_REFRESH_SENTINEL"

    // When
    const encrypted = await encryptToken(secret, token)
    const decrypted = await decryptToken(secret, encrypted)

    // Then
    expect(encrypted).not.toContain(token)
    expect(decrypted).toBe(token)
  })
})
