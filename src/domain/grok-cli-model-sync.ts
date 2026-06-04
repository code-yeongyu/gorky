import { z } from "zod"

const GrokModelsCacheSchema = z.object({
  auth_method: z.string().optional(),
  models: z.record(z.string(), z.unknown()).optional(),
})

export type GrokModelsCacheSummary =
  | { readonly kind: "missing" }
  | { readonly kind: "invalid" }
  | {
      readonly kind: "present"
      readonly authMethod: string
      readonly modelIds: readonly string[]
    }

type EmptyGrokModelsDiagnosticInput = {
  readonly authJsonPath: string
  readonly authJsonExists: boolean
  readonly cache: GrokModelsCacheSummary
  readonly grokBin: string
  readonly output: string
}

type GrokBinaryPathInput = {
  readonly configuredBin: string | undefined
  readonly commonLocalBinExists: boolean
}

export type WranglerModelIdSet = {
  readonly label: string
  readonly modelIds: readonly string[]
}

export const COMMON_LOCAL_GROK_BIN_PATH = "/Users/yeongyu/.grok/bin/grok"

export function parseGrokCliAvailableModels(output: string): readonly string[] {
  const lines = output.split(/\r?\n/)
  const availableIndex = lines.findIndex((line) => line.trim() === "Available models:")
  if (availableIndex === -1) {
    return []
  }

  const models: string[] = []
  for (const line of lines.slice(availableIndex + 1)) {
    const model = line.trim().replace(/^[-*]\s+/, "")
    if (!model) {
      if (models.length > 0) {
        break
      }
      continue
    }
    if (!isGrokModelId(model)) {
      break
    }
    models.push(model)
  }

  return [...new Set(models)]
}

function isGrokModelId(value: string): boolean {
  return /^grok-[A-Za-z0-9._-]+$/.test(value)
}

export function summarizeGrokModelsCache(value: unknown): GrokModelsCacheSummary {
  const parsed = GrokModelsCacheSchema.safeParse(value)
  if (!parsed.success) {
    return { kind: "invalid" }
  }

  return {
    kind: "present",
    authMethod: parsed.data.auth_method ?? "unknown",
    modelIds: parsed.data.models ? Object.keys(parsed.data.models) : [],
  }
}

export function buildEmptyGrokModelsDiagnostic(input: EmptyGrokModelsDiagnosticInput): string {
  const lines = ["No Grok CLI models found."]
  if (input.output.includes("You are not authenticated.")) {
    lines.push("CLI output says: You are not authenticated.")
  }

  lines.push(
    input.authJsonExists
      ? `Grok auth file: present at ${input.authJsonPath}`
      : `Grok auth file: missing at ${input.authJsonPath}`,
  )
  lines.push(cacheDiagnosticLine(input.cache))
  lines.push(
    `Next step: run \`${input.grokBin} login --device-auth\`, complete browser authorization, then rerun \`pnpm qa:grok-models\`.`,
  )
  return lines.join("\n")
}

export function buildMissingGrokBinaryDiagnostic(grokBin: string): string {
  return [
    `Grok CLI binary was not found: ${grokBin}`,
    "Install the Grok CLI.",
    "Set GORKY_GROK_BIN to the Grok CLI absolute path.",
    "Common local path: /Users/yeongyu/.grok/bin/grok",
  ].join("\n")
}

export function resolveGrokBinaryPath(input: GrokBinaryPathInput): string {
  if (input.configuredBin?.trim()) {
    return input.configuredBin
  }
  return input.commonLocalBinExists ? COMMON_LOCAL_GROK_BIN_PATH : "grok"
}

function cacheDiagnosticLine(cache: GrokModelsCacheSummary): string {
  switch (cache.kind) {
    case "missing":
      return "Cached model catalog: missing"
    case "invalid":
      return "Cached model catalog: unreadable"
    case "present":
      return `Cached model catalog: ${cache.modelIds.length} model(s) from ${cache.authMethod}: ${cache.modelIds.join(", ")}`
  }
}

export function updateWranglerModelIds(toml: string, modelIds: readonly string[]): string {
  if (!modelIds.length) {
    throw new Error("Cannot sync an empty Grok model list")
  }

  const nextValue = `GROK_MODEL_IDS = "${modelIds.join(",")}"`
  const existingModelConfigCount = toml.match(/^GROK_MODEL_IDS = ".*"$/gm)?.length ?? 0
  if (existingModelConfigCount === 0) {
    throw new Error("wrangler.toml is missing GROK_MODEL_IDS")
  }
  const nextToml = toml.replace(/^GROK_MODEL_IDS = ".*"$/gm, nextValue)
  return nextToml
}

export function readWranglerModelIdSets(toml: string): readonly WranglerModelIdSet[] {
  const modelSets: WranglerModelIdSet[] = []
  let currentSection = "top-level"

  for (const line of toml.split(/\r?\n/)) {
    const sectionMatch = line.match(/^\[([^\]]+)\]$/)
    if (sectionMatch?.[1]) {
      currentSection = sectionMatch[1]
      continue
    }

    const modelIdsMatch = line.match(/^GROK_MODEL_IDS = "([^"]*)"$/)
    if (modelIdsMatch?.[1] !== undefined) {
      modelSets.push({
        label: currentSection,
        modelIds: parseModelIds(modelIdsMatch[1]),
      })
    }
  }

  if (!modelSets.length) {
    throw new Error("wrangler.toml is missing GROK_MODEL_IDS")
  }
  return modelSets
}

function parseModelIds(value: string): readonly string[] {
  return value
    .split(",")
    .map((modelId) => modelId.trim())
    .filter((modelId) => modelId.length > 0)
}
