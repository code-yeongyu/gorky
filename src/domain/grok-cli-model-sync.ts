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

export function parseGrokCliAvailableModels(output: string): readonly string[] {
  const lines = output.split(/\r?\n/)
  const availableIndex = lines.findIndex((line) => line.trim() === "Available models:")
  if (availableIndex === -1) {
    return []
  }

  const models = lines
    .slice(availableIndex + 1)
    .map((line) => line.trim().replace(/^[-*]\s+/, ""))
    .filter((line) => line.length > 0)

  return [...new Set(models)]
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
  return toml.replace(/^GROK_MODEL_IDS = ".*"$/gm, nextValue)
}
