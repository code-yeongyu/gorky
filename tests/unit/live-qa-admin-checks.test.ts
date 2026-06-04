import { describe, expect, it } from "vitest"
import { buildAdminUnknownModelLiveChecks } from "../../src/domain/live-qa-admin-checks"

describe("live QA admin unknown-model checks", () => {
  it("Given a live base URL When building admin checks Then OAuth and bulk registration are covered", () => {
    // Given
    const baseUrl = new URL("https://gorky.example.com/base")

    // When
    const checks = buildAdminUnknownModelLiveChecks(baseUrl)

    // Then
    expect(checks.map((check) => check.url.pathname)).toEqual([
      "/api/admin/oauth/start",
      "/api/admin/accounts/bulk",
    ])
    expect(JSON.stringify(checks)).toContain("grok-live-qa-missing")
    expect(JSON.stringify(checks)).toContain("grok-live-qa-bulk-missing")
  })
})
