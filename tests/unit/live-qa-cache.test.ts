import { describe, expect, it } from "vitest"
import { assertNoStoreHeader } from "../../src/domain/live-qa"

describe("live QA cache contracts", () => {
  it("Given an API response has no-store When checking cache policy Then no error is raised", () => {
    // Given
    const headers = new Headers({ "cache-control": "no-store" })

    // When / Then
    expect(() => assertNoStoreHeader(headers, "admin accounts")).not.toThrow()
  })

  it("Given an API response is cacheable When checking cache policy Then the QA check fails", () => {
    // Given
    const headers = new Headers({ "cache-control": "public, max-age=60" })

    // When / Then
    expect(() => assertNoStoreHeader(headers, "admin accounts")).toThrow(
      "Expected admin accounts cache-control to be no-store",
    )
  })
})
