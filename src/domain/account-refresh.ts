import { redactSensitiveData } from "../lib/redaction"
import type {
  AccountTokenRecord,
  ApiError,
  FreshAccountResult,
  TokenRefreshClient,
  TokenStore,
} from "./types"

const REFRESH_SKEW_MS = 5 * 60 * 1000

type EnsureFreshAccountTokenInput = {
  readonly account: AccountTokenRecord
  readonly client: TokenRefreshClient
  readonly force?: boolean
  readonly now: number
  readonly store: TokenStore
}

export async function ensureFreshAccountToken(
  input: EnsureFreshAccountTokenInput,
): Promise<FreshAccountResult> {
  if (!input.force && input.account.expiresAt - input.now > REFRESH_SKEW_MS) {
    return { kind: "success", account: input.account }
  }

  const refresh = await input.client.refresh(input.account.refreshToken)

  switch (refresh.kind) {
    case "success": {
      const nextAccount: AccountTokenRecord = {
        ...input.account,
        accessToken: refresh.accessToken,
        refreshToken: refresh.refreshToken ?? input.account.refreshToken,
        expiresAt: input.now + refresh.expiresInSeconds * 1000,
        status: "active",
      }
      const persisted = await persistRefreshedAccount(input.store, nextAccount)
      if (persisted.kind === "failure") {
        return { kind: "failure", account: nextAccount, error: persisted.error }
      }
      return { kind: "success", account: nextAccount }
    }
    case "failure": {
      const failedAccount: AccountTokenRecord = {
        ...input.account,
        status: "refresh_failed",
      }
      const persisted = await persistRefreshedAccount(input.store, failedAccount)
      if (persisted.kind === "failure") {
        return { kind: "failure", account: failedAccount, error: persisted.error }
      }
      return {
        kind: "failure",
        account: failedAccount,
        error: {
          type: "grok_refresh_error",
          code: refresh.errorCode,
          message: redactRefreshMessage(refresh.message),
        },
      }
    }
  }
}

type PersistRefreshedAccountResult =
  | { readonly kind: "success" }
  | { readonly kind: "failure"; readonly error: ApiError }

async function persistRefreshedAccount(
  store: TokenStore,
  account: AccountTokenRecord,
): Promise<PersistRefreshedAccountResult> {
  try {
    await store.saveRefreshedAccount(account)
    return { kind: "success" }
  } catch (error) {
    if (error instanceof Error) {
      return {
        kind: "failure",
        error: {
          type: "api_error",
          code: "account_refresh_persist_failed",
          message: "Account refresh could not be saved",
        },
      }
    }
    throw error
  }
}

function redactRefreshMessage(message: string): string {
  const redacted = redactSensitiveData(message)
  return typeof redacted === "string" ? redacted : "Grok refresh failed"
}
