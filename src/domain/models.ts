export const DEFAULT_GROK_MODELS = ["grok-composer-2.5-fast"] as const

export type GrokModelId = (typeof DEFAULT_GROK_MODELS)[number]

export function parseGrokModelIds(raw: string | undefined): readonly string[] {
  const configured = raw
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean)

  return configured?.length ? [...new Set(configured)] : DEFAULT_GROK_MODELS
}
