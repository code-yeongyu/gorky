import { describe, expect, it } from "vitest"
import { selectAccountForModel } from "../../src/domain/account-selection"
import type { AccountTokenRecord } from "../../src/domain/types"

describe("selectAccountForModel", () => {
  it("Given multiple active accounts When selecting for a model Then least recently used account is chosen", () => {
    // Given
    const accounts: AccountTokenRecord[] = [
      {
        id: "acct_recent",
        email: "recent@example.com",
        accessToken: "recent-access",
        refreshToken: "recent-refresh",
        expiresAt: 1_780_000_000_000,
        modelIds: ["grok-composer-2.5-fast"],
        status: "active",
        lastUsedAt: 1_770_000_000_000,
      },
      {
        id: "acct_old",
        email: "old@example.com",
        accessToken: "old-access",
        refreshToken: "old-refresh",
        expiresAt: 1_780_000_000_000,
        modelIds: ["grok-composer-2.5-fast"],
        status: "active",
        lastUsedAt: 1_760_000_000_000,
      },
    ]

    // When
    const selected = selectAccountForModel(accounts, "grok-composer-2.5-fast")

    // Then
    expect(selected?.id).toBe("acct_old")
  })
})
