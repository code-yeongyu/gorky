import type { AppDependencies } from "../app"
import type { OAuthStateRecord, OAuthTokenExchangeResult } from "../domain/oauth"
import type { ApiError } from "../domain/types"

type OAuthOperationResult<T> =
  | { readonly kind: "success"; readonly value: T }
  | { readonly kind: "failure"; readonly error: ApiError }

export async function putOAuthState(input: {
  readonly deps: AppDependencies
  readonly state: string
  readonly record: OAuthStateRecord
  readonly ttlSeconds: number
}): Promise<OAuthOperationResult<null>> {
  try {
    await input.deps.oauthStateStore?.put(input.state, input.record, input.ttlSeconds)
    return { kind: "success", value: null }
  } catch (error) {
    if (error instanceof Error) {
      return {
        kind: "failure",
        error: oauthOperationError("oauth_state_persist_failed", "OAuth state could not be stored"),
      }
    }
    throw error
  }
}

export async function getOAuthState(input: {
  readonly deps: AppDependencies
  readonly state: string
}): Promise<OAuthOperationResult<OAuthStateRecord | null>> {
  try {
    const saved = await input.deps.oauthStateStore?.get(input.state)
    return { kind: "success", value: saved ?? null }
  } catch (error) {
    if (error instanceof Error) {
      return {
        kind: "failure",
        error: oauthOperationError("oauth_state_lookup_failed", "OAuth state lookup failed"),
      }
    }
    throw error
  }
}

export async function deleteOAuthState(input: {
  readonly deps: AppDependencies
  readonly state: string
}): Promise<OAuthOperationResult<null>> {
  try {
    await input.deps.oauthStateStore?.delete(input.state)
    return { kind: "success", value: null }
  } catch (error) {
    if (error instanceof Error) {
      return {
        kind: "failure",
        error: oauthOperationError("oauth_state_delete_failed", "OAuth state could not be deleted"),
      }
    }
    throw error
  }
}

export async function exchangeOAuthCode(input: {
  readonly deps: AppDependencies
  readonly code: string
  readonly codeVerifier: string
  readonly redirectUri: string
}): Promise<OAuthOperationResult<OAuthTokenExchangeResult>> {
  try {
    const exchanged = await input.deps.oauthAuthorizationClient?.exchangeCode({
      code: input.code,
      codeVerifier: input.codeVerifier,
      redirectUri: input.redirectUri,
    })
    if (!exchanged) {
      return {
        kind: "failure",
        error: oauthOperationError("oauth_not_configured", "OAuth unavailable"),
      }
    }
    return { kind: "success", value: exchanged }
  } catch (error) {
    if (error instanceof Error) {
      return {
        kind: "failure",
        error: oauthOperationError("oauth_exchange_failed", "OAuth exchange failed"),
      }
    }
    throw error
  }
}

function oauthOperationError(code: string, message: string): ApiError {
  return {
    type: "api_error",
    code,
    message,
  }
}
