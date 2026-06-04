import { describe, expect, it } from "vitest"
import { parseManualAccountBatch } from "../../apps/web/src/bulk-account-import"

describe("bulk account import parser", () => {
  it("Given a valid account JSON array When parsing a batch Then account fields are preserved", () => {
    // Given
    const text = JSON.stringify([
      {
        email: " first@example.com ",
        accessToken: " access-token ",
        refreshToken: " refresh-token ",
        expiresAt: 1_780_001_000_000,
        modelIds: ["grok-build", "grok-build"],
      },
    ])

    // When
    const result = parseManualAccountBatch(text)

    // Then
    expect(result).toMatchObject({
      kind: "success",
      accounts: [
        {
          email: "first@example.com",
          accessToken: "access-token",
          refreshToken: "refresh-token",
          expiresAt: 1_780_001_000_000,
          modelIds: ["grok-build"],
        },
      ],
    })
  })

  it("Given invalid account JSON When parsing a batch Then a friendly error is returned", () => {
    // Given
    const text = "["

    // When
    const result = parseManualAccountBatch(text)

    // Then
    expect(result).toEqual({
      kind: "failure",
      message: "Accounts JSON is invalid.",
    })
  })

  it("Given an API-shaped accounts JSON object When parsing a batch Then accounts are accepted", () => {
    // Given
    const text = JSON.stringify({
      accounts: [
        {
          email: "second@example.com",
          accessToken: "access-token",
          refreshToken: "refresh-token",
          expiresAt: 1_780_001_000_000,
          modelIds: ["grok-composer-2.5-fast"],
        },
      ],
    })

    // When
    const result = parseManualAccountBatch(text)

    // Then
    expect(result).toMatchObject({
      kind: "success",
      accounts: [
        {
          email: "second@example.com",
          modelIds: ["grok-composer-2.5-fast"],
        },
      ],
    })
  })
})
