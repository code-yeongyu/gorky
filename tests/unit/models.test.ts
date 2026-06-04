import { describe, expect, it } from "vitest"
import { DEFAULT_GROK_MODELS, parseGrokModelIds } from "../../src/domain/models"

describe("Grok model configuration", () => {
  it("Given observed Grok CLI models When reading defaults Then only available CLI models are advertised", () => {
    // Given / When / Then
    expect(DEFAULT_GROK_MODELS).toEqual(["grok-composer-2.5-fast"])
  })

  it("Given no configured models When parsing model ids Then observed CLI defaults are used", () => {
    expect(parseGrokModelIds(undefined)).toEqual(DEFAULT_GROK_MODELS)
  })

  it("Given comma-separated models When parsing model ids Then whitespace is trimmed and duplicates are removed", () => {
    expect(parseGrokModelIds(" grok-build, custom-model, grok-build ")).toEqual([
      "grok-build",
      "custom-model",
    ])
  })
})
