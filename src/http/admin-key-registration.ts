import type { AppDependencies } from "../app"
import type { ApiError, ApiKeyRecord } from "../domain/types"

type SaveApiKeyResult =
  | { readonly kind: "success"; readonly record: ApiKeyRecord }
  | { readonly kind: "failure"; readonly error: ApiError }

type ListApiKeysResult =
  | { readonly kind: "success"; readonly records: readonly ApiKeyRecord[] }
  | { readonly kind: "failure"; readonly error: ApiError }

type RevokeApiKeyResult =
  | { readonly kind: "success"; readonly record: ApiKeyRecord | null }
  | { readonly kind: "failure"; readonly error: ApiError }

export async function listRegisteredApiKeys(deps: AppDependencies): Promise<ListApiKeysResult> {
  try {
    return { kind: "success", records: await deps.store.listApiKeys() }
  } catch (error) {
    if (error instanceof Error) {
      return {
        kind: "failure",
        error: keyStorageError("key_list_failed", "API keys failed to load"),
      }
    }
    throw error
  }
}

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

export async function revokeRegisteredApiKey(
  deps: AppDependencies,
  keyId: string,
): Promise<RevokeApiKeyResult> {
  try {
    return { kind: "success", record: await deps.store.revokeApiKey(keyId, deps.now()) }
  } catch (error) {
    if (error instanceof Error) {
      return {
        kind: "failure",
        error: keyStorageError("key_revoke_failed", "API key could not be revoked"),
      }
    }
    throw error
  }
}

function keyStorageError(code: string, message: string): ApiError {
  return {
    type: "api_error",
    code,
    message,
  }
}
