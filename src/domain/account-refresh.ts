import { redactSensitiveData } from "../lib/redaction"
import type {
  AccountTokenRecord,
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
      await input.store.saveRefreshedAccount(nextAccount)
      return { kind: "success", account: nextAccount }
    }
    case "failure": {
      const failedAccount: AccountTokenRecord = {
        ...input.account,
        status: "refresh_failed",
      }
      await input.store.saveRefreshedAccount(failedAccount)
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

function redactRefreshMessage(message: string): string {
  const redacted = redactSensitiveData(message)
  return typeof redacted === "string" ? redacted : "Grok refresh failed"
}
