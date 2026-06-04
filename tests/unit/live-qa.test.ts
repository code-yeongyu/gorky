import { describe, expect, it } from "vitest"
import {
  AdminProtectionResponseSchema,
  ApiModelsResponseSchema,
  assertAdminProtectionResponse,
  assertMatchingModelCatalog,
  assertModelCatalogContains,
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

  it("Given Grok CLI models When live catalog omits one Then the QA check fails", () => {
    expect(() =>
      assertModelCatalogContains(
        ["grok-composer-2.5-fast", "grok-build", "grok-reasoning"],
        ["grok-composer-2.5-fast", "grok-build"],
        "live /api/models",
      ),
    ).toThrow("live /api/models is missing Grok CLI model(s): grok-reasoning")
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

  it("Given an unauthenticated admin response When status and body match Then the QA check passes", () => {
    // Given
    const body = AdminProtectionResponseSchema.parse({
      error: {
        type: "authentication_error",
        code: "invalid_admin_token",
        message: "Invalid admin token",
      },
    })

    // When / Then
    expect(() => assertAdminProtectionResponse(401, body, "list accounts")).not.toThrow()
  })

  it("Given an admin route returns success When checking protection Then the QA check fails", () => {
    // Given
    const body = { ok: true }

    // When / Then
    expect(() => assertAdminProtectionResponse(200, body, "list accounts")).toThrow(
      "Expected list accounts admin protection to return 401, got 200",
    )
  })
})
