import { describe, expect, it } from "vitest"
import {
  buildEmptyGrokModelsDiagnostic,
  buildMissingGrokBinaryDiagnostic,
  parseGrokCliAvailableModels,
  readWranglerModelIdSets,
  resolveGrokBinaryPath,
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

  it("Given grok models output has footer text When parsing available models Then footer lines are ignored", () => {
    // Given
    const output = `
Default model: grok-build

Available models:
  grok-build
  grok-composer-2.5-fast

Use grok config set model <model> to change the default.
`

    // When
    const models = parseGrokCliAvailableModels(output)

    // Then
    expect(models).toEqual(["grok-build", "grok-composer-2.5-fast"])
  })

  it("Given grok models output marks the default model When parsing available models Then the marker is ignored", () => {
    // Given
    const output = `
You are logged in with grok.com.

Default model: grok-build

Available models:
  - grok-composer-2.5-fast
  * grok-build (default)
`

    // When
    const models = parseGrokCliAvailableModels(output)

    // Then
    expect(models).toEqual(["grok-composer-2.5-fast", "grok-build"])
  })

  it("Given grok models output has an inline footer When parsing available models Then only model ids are extracted", () => {
    // Given
    const output = `
Available models:
  grok-build
  grok-composer-2.5-fast
Use grok config set model <model> to change the default.
`

    // When
    const models = parseGrokCliAvailableModels(output)

    // Then
    expect(models).toEqual(["grok-build", "grok-composer-2.5-fast"])
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

  it("Given wrangler config already has model ids When updating model ids Then sync is idempotent", () => {
    // Given
    const config = `
[vars]
GROK_MODEL_IDS = "grok-composer-2.5-fast,grok-build"
`

    // When
    const nextConfig = updateWranglerModelIds(config, ["grok-composer-2.5-fast", "grok-build"])

    // Then
    expect(nextConfig).toBe(config)
  })

  it("Given wrangler config is missing model ids When updating model ids Then sync fails loudly", () => {
    // Given
    const config = `
[vars]
GROK_CLIENT_VERSION = "0.2.16"
`

    // When
    const update = () => updateWranglerModelIds(config, ["grok-build"])

    // Then
    expect(update).toThrow("wrangler.toml is missing GROK_MODEL_IDS")
  })

  it("Given wrangler config has env model ids When reading model sets Then every env is returned", () => {
    // Given
    const config = `
[vars]
GROK_MODEL_IDS = "grok-build"

[env.production.vars]
GROK_MODEL_IDS = "grok-composer-2.5-fast"
`

    // When
    const modelSets = readWranglerModelIdSets(config)

    // Then
    expect(modelSets).toEqual([
      { label: "vars", modelIds: ["grok-build"] },
      { label: "env.production.vars", modelIds: ["grok-composer-2.5-fast"] },
    ])
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

  it("Given empty CLI models and a rerun command When building diagnostics Then the command is included", () => {
    // Given
    const cache = summarizeGrokModelsCache({ auth_method: "api_key", models: {} })

    // When
    const message = buildEmptyGrokModelsDiagnostic({
      authJsonPath: "/Users/qa/.grok/auth.json",
      authJsonExists: false,
      cache,
      grokBin: "/Users/qa/.grok/bin/grok",
      output: "You are not authenticated.",
      rerunCommand: "pnpm models:sync",
    })

    // Then
    expect(message).toContain("then rerun `pnpm models:sync`")
  })

  it("Given grok binary is missing When building diagnostics Then the setup fix is explained", () => {
    // When
    const message = buildMissingGrokBinaryDiagnostic("grok")

    // Then
    expect(message).toContain("Grok CLI binary was not found: grok")
    expect(message).toContain("Set GORKY_GROK_BIN")
    expect(message).toContain("/Users/yeongyu/.grok/bin/grok")
  })

  it("Given no configured binary and common local binary exists When resolving path Then common path is used", () => {
    // When
    const grokBin = resolveGrokBinaryPath({
      configuredBin: undefined,
      commonLocalBinExists: true,
    })

    // Then
    expect(grokBin).toBe("/Users/yeongyu/.grok/bin/grok")
  })

  it("Given configured binary and common local binary exists When resolving path Then configured path wins", () => {
    // When
    const grokBin = resolveGrokBinaryPath({
      configuredBin: "/opt/grok/bin/grok",
      commonLocalBinExists: true,
    })

    // Then
    expect(grokBin).toBe("/opt/grok/bin/grok")
  })

  it("Given no configured binary and no common local binary When resolving path Then shell path is used", () => {
    // When
    const grokBin = resolveGrokBinaryPath({
      configuredBin: undefined,
      commonLocalBinExists: false,
    })

    // Then
    expect(grokBin).toBe("grok")
  })
})
