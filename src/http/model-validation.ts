import type { AppDependencies } from "../app"
import { findUnknownModelIds } from "../domain/model-catalog"
import { DEFAULT_GROK_MODELS } from "../domain/models"
import type { ApiError } from "../domain/types"

export type ModelValidationResult =
  | { readonly kind: "success" }
  | {
      readonly kind: "failure"
      readonly error: ApiError
      readonly unknownModelIds: readonly string[]
    }

export function validateConfiguredModels(
  deps: AppDependencies,
  requestedModels: readonly string[],
): ModelValidationResult {
  const unknownModelIds = findUnknownModelIds(requestedModels, deps.models ?? DEFAULT_GROK_MODELS)
  if (!unknownModelIds.length) {
    return { kind: "success" }
  }
  return {
    kind: "failure",
    unknownModelIds,
    error: {
      type: "invalid_request_error",
      code: "unknown_model",
      message: `Unknown model: ${unknownModelIds.join(", ")}`,
    },
  }
}
