export const GROK_MODELS = ["grok-composer-2.5-fast", "grok-build"] as const

export type GrokModelId = (typeof GROK_MODELS)[number]
