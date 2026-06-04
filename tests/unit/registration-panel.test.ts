import { describe, expect, it } from "vitest"
import { buildOAuthStartBody } from "../../apps/web/src/oauth-start-form"

describe("registration panel", () => {
  it("Given empty callback URL When building OAuth start body Then a friendly error is returned", () => {
    // Given
    const form = new FormData()

    // When
    const result = buildOAuthStartBody(form, ["grok-composer-2.5-fast"])

    // Then
    expect(result).toEqual({
      kind: "failure",
      message: "OAuth start needs a Grok CLI loopback callback URL.",
    })
  })

  it("Given loopback callback URL When building OAuth start body Then selected models are preserved", () => {
    // Given
    const form = new FormData()
    form.set("redirectUri", "http://127.0.0.1:34567/callback")
    form.append("modelIds", "grok-composer-2.5-fast")

    // When
    const result = buildOAuthStartBody(form, ["grok-build"])

    // Then
    expect(result).toEqual({
      kind: "success",
      body: {
        redirectUri: "http://127.0.0.1:34567/callback",
        modelIds: ["grok-composer-2.5-fast"],
      },
    })
  })
})
