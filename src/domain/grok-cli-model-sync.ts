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

export function updateWranglerModelIds(toml: string, modelIds: readonly string[]): string {
  if (!modelIds.length) {
    throw new Error("Cannot sync an empty Grok model list")
  }

  const nextValue = `GROK_MODEL_IDS = "${modelIds.join(",")}"`
  return toml.replace(/^GROK_MODEL_IDS = ".*"$/gm, nextValue)
}
