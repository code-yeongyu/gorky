import { describe, expect, it } from "vitest"
import {
  AdminProtectionResponseSchema,
  ApiModelsResponseSchema,
  assertAdminProtectionResponse,
  assertMatchingModelCatalog,
  assertModelCatalogContains,
  assertOAuthUnknownModelResponse,
  assertOpenGraphMetadata,
  assertPublicAssetResponse,
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

  it("Given OAuth rejects an unknown model When checking live behavior Then the QA check passes", () => {
    // Given
    const body = {
      error: {
        type: "invalid_request_error",
        code: "unknown_model",
        message: "Unknown model: grok-live-qa-missing",
      },
    }

    // When / Then
    expect(() => assertOAuthUnknownModelResponse(400, body)).not.toThrow()
  })

  it("Given OAuth accepts an unknown model When checking live behavior Then the QA check fails", () => {
    // Given
    const body = { authorizationUrl: "https://auth.x.ai/authorize", state: "state_1" }

    // When / Then
    expect(() => assertOAuthUnknownModelResponse(201, body)).toThrow(
      "Expected OAuth unknown-model live check to return 400, got 201",
    )
  })

  it("Given OpenGraph tags are complete When checking metadata Then the QA check passes", () => {
    // Given
    const metadata = {
      title: "Gorky",
      description: "A secure Grok OAuth account console and OpenAI-compatible API proxy.",
      type: "website",
      image: "/og.svg",
      twitterCard: "summary_large_image",
    }

    // When / Then
    expect(() => assertOpenGraphMetadata(metadata)).not.toThrow()
  })

  it("Given OpenGraph image is missing When checking metadata Then the QA check fails", () => {
    // Given
    const metadata = {
      title: "Gorky",
      description: "A secure Grok OAuth account console and OpenAI-compatible API proxy.",
      type: "website",
      image: null,
      twitterCard: "summary_large_image",
    }

    // When / Then
    expect(() => assertOpenGraphMetadata(metadata)).toThrow("Missing OpenGraph metadata: image")
  })

  it("Given a public SVG asset responds When checking the asset Then the QA check passes", () => {
    // Given
    const response = {
      status: 200,
      contentType: "image/svg+xml",
      label: "OpenGraph image",
    }

    // When / Then
    expect(() => assertPublicAssetResponse(response)).not.toThrow()
  })

  it("Given a public asset is missing When checking the asset Then the QA check fails", () => {
    // Given
    const response = {
      status: 404,
      contentType: "text/html",
      label: "manifest icon",
    }

    // When / Then
    expect(() => assertPublicAssetResponse(response)).toThrow(
      "Expected manifest icon asset to return 200, got 404",
    )
  })
})
