import { describe, expect, it } from "vitest"
import { redactSensitiveData } from "../../src/lib/redaction"

describe("redactSensitiveData", () => {
  it("Given sensitive headers and OAuth fields When redaction runs Then no raw secret remains", () => {
    // Given
    const input = {
      headers: {
        Authorization: "Bearer sk-real-looking-secret",
        "x-api-key": "gorky_secret_key",
      },
      access_token: "SENSITIVE_ACCESS_SENTINEL",
      refresh_token: "SENSITIVE_REFRESH_SENTINEL",
      model: "grok-composer-2.5-fast",
    }

    // When
    const redacted = redactSensitiveData(input)
    const text = JSON.stringify(redacted)

    // Then
    expect(text).toContain("[REDACTED]")
    expect(text).toContain("grok-composer-2.5-fast")
    expect(text).not.toContain("sk-real-looking-secret")
    expect(text).not.toContain("gorky_secret_key")
    expect(text).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(text).not.toContain("SENSITIVE_REFRESH_SENTINEL")
  })

  it("Given secret shaped strings under safe keys When redaction runs Then values are sanitized", () => {
    // Given
    const input = {
      message: "upstream failed with Bearer SENSITIVE_ACCESS_SENTINEL",
      keyPrefix: "gorky_123456",
      model: "grok-build",
      nested: ["created key gorky_secret_plaintext"],
    }

    // When
    const redacted = redactSensitiveData(input)
    const text = JSON.stringify(redacted)

    // Then
    expect(text).toContain("[REDACTED]")
    expect(text).toContain("gorky_123456")
    expect(text).toContain("grok-build")
    expect(text).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(text).not.toContain("gorky_secret_plaintext")
  })
})
