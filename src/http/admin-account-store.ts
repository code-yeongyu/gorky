import type { AppDependencies } from "../app"
import type { AccountTokenRecord, ApiError } from "../domain/types"

type ListAccountsResult =
  | { readonly kind: "success"; readonly accounts: readonly AccountTokenRecord[] }
  | { readonly kind: "failure"; readonly error: ApiError }

type AccountMutationResult =
  | { readonly kind: "success"; readonly account: AccountTokenRecord | null }
  | { readonly kind: "failure"; readonly error: ApiError }

export async function listRegisteredAccounts(deps: AppDependencies): Promise<ListAccountsResult> {
  try {
    return { kind: "success", accounts: await deps.store.listAccounts() }
  } catch (error) {
    if (error instanceof Error) {
      return {
        kind: "failure",
        error: accountStoreError("account_list_failed", "Accounts failed to load"),
      }
    }
    throw error
  }
}

export async function disableRegisteredAccount(
  deps: AppDependencies,
  accountId: string,
): Promise<AccountMutationResult> {
  try {
    return { kind: "success", account: await deps.store.disableAccount(accountId) }
  } catch (error) {
    if (error instanceof Error) {
      return {
        kind: "failure",
        error: accountStoreError("account_disable_failed", "Account could not be disabled"),
      }
    }
    throw error
  }
}

export async function enableRegisteredAccount(
  deps: AppDependencies,
  accountId: string,
): Promise<AccountMutationResult> {
  try {
    return { kind: "success", account: await deps.store.enableAccount(accountId) }
  } catch (error) {
    if (error instanceof Error) {
      return {
        kind: "failure",
        error: accountStoreError("account_enable_failed", "Account could not be enabled"),
      }
    }
    throw error
  }
}

export async function findRegisteredAccount(
  deps: AppDependencies,
  accountId: string,
): Promise<AccountMutationResult> {
  try {
    return { kind: "success", account: await deps.store.findAccountById(accountId) }
  } catch (error) {
    if (error instanceof Error) {
      return {
        kind: "failure",
        error: accountStoreError("account_lookup_failed", "Account lookup failed"),
      }
    }
    throw error
  }
}

function accountStoreError(code: string, message: string): ApiError {
  return {
    type: "api_error",
    code,
    message,
  }
}
