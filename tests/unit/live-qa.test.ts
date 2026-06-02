import { describe, expect, it } from "vitest"
import {
  ApiModelsResponseSchema,
  assertMatchingModelCatalog,
  ManifestResponseSchema,
  V1ModelsResponseSchema,
} from "../../src/domain/live-qa"

describe("live QA contracts", () => {
  it("Given live model responses When catalogs match Then no error is raised", () => {
    // Given
    const apiModels = ApiModelsResponseSchema.parse({
      models: ["grok-composer-2.5-fast", "grok-build"],
    })
    const v1Models = V1ModelsResponseSchema.parse({
      object: "list",
      data: [
        { id: "grok-composer-2.5-fast", object: "model", created: 0, owned_by: "xai" },
        { id: "grok-build", object: "model", created: 0, owned_by: "xai" },
      ],
    })

    // When / Then
    expect(() => assertMatchingModelCatalog(apiModels, v1Models)).not.toThrow()
  })

  it("Given live model responses When catalogs diverge Then the QA check fails", () => {
    // Given
    const apiModels = ApiModelsResponseSchema.parse({
      models: ["grok-build"],
    })
    const v1Models = V1ModelsResponseSchema.parse({
      object: "list",
      data: [{ id: "grok-composer-2.5-fast", object: "model", created: 0, owned_by: "xai" }],
    })

    // When / Then
    expect(() => assertMatchingModelCatalog(apiModels, v1Models)).toThrow(
      "Live model catalogs diverged",
    )
  })

  it("Given a manifest response When parsing Then standalone PWA metadata is required", () => {
    // Given
    const manifest = {
      name: "Gorky",
      short_name: "Gorky",
      display: "standalone",
      icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
    }

    // When
    const parsed = ManifestResponseSchema.parse(manifest)

    // Then
    expect(parsed.display).toBe("standalone")
    expect(parsed.icons).toHaveLength(1)
  })
})
