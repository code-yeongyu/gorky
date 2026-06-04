import { describe, expect, it } from "vitest"
import {
  buildEmptyGrokModelsDiagnostic,
  parseGrokCliAvailableModels,
  summarizeGrokModelsCache,
  updateWranglerModelIds,
} from "../../src/domain/grok-cli-model-sync"

describe("Grok CLI model sync", () => {
  it("Given authenticated grok models output When parsing available models Then model ids are extracted in order", () => {
    // Given
    const output = `
Default model: grok-build

Available models:
  grok-composer-2.5-fast
  - grok-build
  * grok-reasoning
`

    // When
    const models = parseGrokCliAvailableModels(output)

    // Then
    expect(models).toEqual(["grok-composer-2.5-fast", "grok-build", "grok-reasoning"])
  })

  it("Given unauthenticated grok models output When parsing available models Then no defaults are invented", () => {
    // Given
    const output = `
You are not authenticated.

Default model: grok-build

Available models:
`

    // When
    const models = parseGrokCliAvailableModels(output)

    // Then
    expect(models).toEqual([])
  })

  it("Given wrangler config When updating model ids Then every environment receives the same list", () => {
    // Given
    const config = `
[vars]
GROK_MODEL_IDS = "grok-build"

[env.production.vars]
GROK_MODEL_IDS = "grok-build"
`

    // When
    const nextConfig = updateWranglerModelIds(config, ["grok-composer-2.5-fast", "grok-build"])

    // Then
    expect(nextConfig).toContain('GROK_MODEL_IDS = "grok-composer-2.5-fast,grok-build"')
    expect(nextConfig.match(/GROK_MODEL_IDS/g)).toHaveLength(2)
  })

  it("Given empty CLI models and cached ids When building diagnostics Then auth and cache state are explained", () => {
    // Given
    const cache = summarizeGrokModelsCache({
      auth_method: "api_key",
      models: {
        "grok-composer-2.5-fast": {},
        "grok-build": {},
      },
    })

    // When
    const message = buildEmptyGrokModelsDiagnostic({
      authJsonPath: "/Users/qa/.grok/auth.json",
      authJsonExists: false,
      cache,
      grokBin: "/Users/qa/.grok/bin/grok",
      output: "You are not authenticated.\n\nDefault model: grok-build\n\nAvailable models:\n",
    })

    // Then
    expect(message).toContain("No Grok CLI models found.")
    expect(message).toContain("CLI output says: You are not authenticated.")
    expect(message).toContain("Grok auth file: missing at /Users/qa/.grok/auth.json")
    expect(message).toContain(
      "Cached model catalog: 2 model(s) from api_key: grok-composer-2.5-fast, grok-build",
    )
    expect(message).toContain("/Users/qa/.grok/bin/grok login --device-auth")
  })
})
