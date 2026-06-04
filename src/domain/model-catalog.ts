export function findUnknownModelIds(
  requestedModels: readonly string[],
  knownModels: readonly string[],
): readonly string[] {
  const knownModelSet = new Set(knownModels)
  return [...new Set(requestedModels.filter((model) => !knownModelSet.has(model)))]
}
