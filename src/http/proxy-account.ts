import type { AppDependencies } from "../app"
import { ensureFreshAccountToken } from "../domain/account-refresh"
import { selectAccountForModel } from "../domain/account-selection"
import type { AccountTokenRecord } from "../domain/types"
import { authenticateApiKey, toOpenAiError } from "./auth"
import { validateConfiguredModels } from "./model-validation"
import type { PreparedProxyAccount } from "./upstream-forwarding"

type PrepareAccountFailure = {
  readonly kind: "failure"
  readonly error: { readonly code: string; readonly type: string; readonly message: string }
  readonly status: 400 | 401 | 403 | 429 | 502 | 503
  readonly keyPrefix?: string
}

type AccountPoolResult =
  | { readonly kind: "success"; readonly accounts: readonly AccountTokenRecord[] }
  | { readonly kind: "failure"; readonly error: PrepareAccountFailure["error"] }

export async function prepareAccount(
  deps: AppDependencies,
  headers: Headers,
  model: string,
): Promise<PreparedProxyAccount | PrepareAccountFailure> {
  const auth = await authenticateApiKey(deps.store, headers, model)
  if (auth.kind === "failure") {
    return { kind: "failure", error: auth.error, status: auth.status } as const
  }

  const configured = validateConfiguredModels(deps, [model])
  if (configured.kind === "failure") {
    return {
      kind: "failure",
      error: configured.error,
      status: 400,
      keyPrefix: auth.record.keyPrefix,
    } as const
  }

  const accountPool = await listAccountPool(deps)
  if (accountPool.kind === "failure") {
    return {
      kind: "failure",
      error: accountPool.error,
      status: 502,
      keyPrefix: auth.record.keyPrefix,
    } as const
  }

  const selected = selectAccountForModel(accountPool.accounts, model)
  if (!selected) {
    return {
      kind: "failure",
      error: toOpenAiError("invalid_request_error", "model_unavailable", "No account can use model")
        .error,
      status: 503,
      keyPrefix: auth.record.keyPrefix,
    } as const
  }

  const fresh = await ensureFreshAccountToken({
    account: selected,
    client: { refresh: deps.refreshClient },
    now: deps.now(),
    store: deps.store,
  })
  if (fresh.kind === "failure") {
    return {
      kind: "failure",
      error: fresh.error,
      status: 502,
      keyPrefix: auth.record.keyPrefix,
    } as const
  }

  return {
    kind: "success",
    account: fresh.account,
    keyHash: auth.record.keyHash,
    keyPrefix: auth.record.keyPrefix,
  } as const
}

async function listAccountPool(deps: AppDependencies): Promise<AccountPoolResult> {
  try {
    return { kind: "success", accounts: await deps.store.listAccounts() }
  } catch (error) {
    if (error instanceof Error) {
      return {
        kind: "failure",
        error: {
          type: "gorky_storage_error",
          code: "account_pool_lookup_failed",
          message: "Account pool lookup failed",
        },
      }
    }
    throw error
  }
}
