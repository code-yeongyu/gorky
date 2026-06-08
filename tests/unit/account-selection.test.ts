import { describe, expect, it } from "vitest"
import { selectAccountForModel } from "../../src/domain/account-selection"
import type { AccountTokenRecord } from "../../src/domain/types"

describe("selectAccountForModel", () => {
  it("Given round robin mode When selecting for a model Then least recently used account is chosen", () => {
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
    const selected = selectAccountForModel(accounts, "grok-composer-2.5-fast", {
      mode: "round_robin",
    })

    // Then
    expect(selected?.id).toBe("acct_old")
  })

  it("Given priority mode When selecting for a model Then highest priority account is chosen first", () => {
    // Given
    const accounts: AccountTokenRecord[] = [
      {
        id: "acct_low",
        email: "low@example.com",
        accessToken: "low-access",
        refreshToken: "low-refresh",
        expiresAt: 1_780_000_000_000,
        modelIds: ["grok-build"],
        status: "active",
        lastUsedAt: 1_760_000_000_000,
        priority: 100,
      },
      {
        id: "acct_high",
        email: "high@example.com",
        accessToken: "high-access",
        refreshToken: "high-refresh",
        expiresAt: 1_780_000_000_000,
        modelIds: ["grok-build"],
        status: "active",
        lastUsedAt: 1_770_000_000_000,
        priority: 5,
      },
    ]

    // When
    const selected = selectAccountForModel(accounts, "grok-build", { mode: "priority" })

    // Then
    expect(selected?.id).toBe("acct_high")
  })
})
