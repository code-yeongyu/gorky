import { describe, expect, it } from "vitest"
import { accountPrincipalLabel } from "../../apps/web/src/account-presenters"

describe("account presenters", () => {
  it("Given an account principal type When label is built Then it is dashboard friendly", () => {
    // Given
    const principalType = "User"

    // When
    const label = accountPrincipalLabel(principalType)

    // Then
    expect(label).toBe("User account")
  })
})
