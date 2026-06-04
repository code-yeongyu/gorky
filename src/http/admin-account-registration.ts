import type { z } from "zod"
import type { AppDependencies } from "../app"
import type { AccountTokenRecord, ApiError } from "../domain/types"
import type { RegisterAccountRequestSchema } from "./schemas"

type RegisterAccountInput = z.infer<typeof RegisterAccountRequestSchema>

type SaveRegisteredAccountsResult =
  | { readonly kind: "success"; readonly accounts: readonly AccountTokenRecord[] }
  | { readonly kind: "failure"; readonly error: ApiError }

export function createRegisteredAccount(input: RegisterAccountInput): AccountTokenRecord {
  return {
    id: `acct_${crypto.randomUUID()}`,
    email: input.email,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    expiresAt: input.expiresAt,
    modelIds: input.modelIds,
    status: "active",
    lastUsedAt: null,
  }
}

export async function saveRegisteredAccounts(
  deps: AppDependencies,
  accounts: readonly AccountTokenRecord[],
): Promise<SaveRegisteredAccountsResult> {
  try {
    await deps.store.saveAccounts(accounts)
    return { kind: "success", accounts }
  } catch (error) {
    if (error instanceof Error) {
      return { kind: "failure", error: accountRegistrationFailed() }
    }
    throw error
  }
}

export function accountRegistrationFailed(): ApiError {
  return {
    type: "api_error",
    code: "account_registration_failed",
    message: "Account registration failed",
  }
}
