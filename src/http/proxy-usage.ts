import type { AppDependencies } from "../app"
import type { ApiError } from "../domain/types"
import { toOpenAiError } from "./auth"

type RecordProxyUsageResult =
  | { readonly kind: "success" }
  | { readonly kind: "failure"; readonly error: ApiError; readonly status: 502 }

export async function recordProxyUsage(input: {
  readonly deps: AppDependencies
  readonly accountId: string
  readonly keyHash: string
  readonly usedAt: number
}): Promise<RecordProxyUsageResult> {
  try {
    await input.deps.store.touchAccount(input.accountId, input.usedAt)
    await input.deps.store.touchApiKey(input.keyHash, input.usedAt)
    return { kind: "success" }
  } catch (error) {
    if (error instanceof Error) {
      return {
        kind: "failure",
        status: 502,
        error: toOpenAiError(
          "gorky_storage_error",
          "usage_touch_failed",
          "Proxy usage could not be recorded",
        ).error,
      }
    }
    throw error
  }
}
