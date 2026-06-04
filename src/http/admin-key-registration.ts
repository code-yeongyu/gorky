import type { AppDependencies } from "../app"
import type { ApiError, ApiKeyRecord } from "../domain/types"

type SaveApiKeyResult =
  | { readonly kind: "success"; readonly record: ApiKeyRecord }
  | { readonly kind: "failure"; readonly error: ApiError }

export async function saveRegisteredApiKey(
  deps: AppDependencies,
  record: ApiKeyRecord,
): Promise<SaveApiKeyResult> {
  try {
    await deps.store.saveApiKey(record)
    return { kind: "success", record }
  } catch (error) {
    if (error instanceof Error) {
      return {
        kind: "failure",
        error: {
          type: "api_error",
          code: "key_storage_failed",
          message: "API key could not be stored",
        },
      }
    }
    throw error
  }
}
