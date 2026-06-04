import type { AppDependencies } from "../app"
import { ensureFreshAccountToken } from "../domain/account-refresh"
import type { AccountTokenRecord, ApiError } from "../domain/types"
import { getRequestId, toOpenAiError } from "./auth"

export type PreparedProxyAccount = {
  readonly kind: "success"
  readonly account: AccountTokenRecord
  readonly keyHash: string
  readonly keyPrefix: string
}

type ForwardFailure = {
  readonly kind: "failure"
  readonly error: ApiError
  readonly status: 502
  readonly keyPrefix: string
}

type ForwardSuccess = {
  readonly kind: "success"
  readonly response: Response
  readonly account: AccountTokenRecord
}

export async function forwardWithAuthRetry(input: {
  readonly deps: AppDependencies
  readonly request: Request
  readonly path: string
  readonly model: string
  readonly prepared: PreparedProxyAccount
  readonly createRequest: (accessToken: string) => Request
}): Promise<ForwardSuccess | ForwardFailure> {
  const firstResponse = await callUpstream(
    input.deps,
    input.createRequest(input.prepared.account.accessToken),
    input.prepared.keyPrefix,
  )
  if (firstResponse.kind === "failure") {
    return firstResponse
  }
  if (!isUpstreamAuthFailure(firstResponse.response.status)) {
    return { kind: "success", response: firstResponse.response, account: input.prepared.account }
  }

  const refreshed = await ensureFreshAccountToken({
    account: input.prepared.account,
    client: { refresh: input.deps.refreshClient },
    force: true,
    now: input.deps.now(),
    store: input.deps.store,
  })
  if (refreshed.kind === "failure") {
    return {
      kind: "failure",
      error: refreshed.error,
      status: 502,
      keyPrefix: input.prepared.keyPrefix,
    }
  }

  input.deps.logger?.({
    event: "upstream_auth_retry",
    requestId: getRequestId(input.request.headers),
    path: input.path,
    method: input.request.method,
    keyPrefix: input.prepared.keyPrefix,
    status: firstResponse.response.status,
    model: input.model,
    metadata: {
      upstreamStatus: firstResponse.response.status,
    },
  })

  const retryResponse = await callUpstream(
    input.deps,
    input.createRequest(refreshed.account.accessToken),
    input.prepared.keyPrefix,
  )
  if (retryResponse.kind === "failure") {
    return retryResponse
  }
  if (isUpstreamAuthFailure(retryResponse.response.status)) {
    return {
      kind: "failure",
      status: 502,
      keyPrefix: input.prepared.keyPrefix,
      error: toOpenAiError(
        "grok_upstream_error",
        "upstream_auth_failed",
        "Grok upstream authentication failed after refresh",
      ).error,
    }
  }
  return { kind: "success", response: retryResponse.response, account: refreshed.account }
}

async function callUpstream(
  deps: AppDependencies,
  request: Request,
  keyPrefix: string,
): Promise<{ readonly kind: "success"; readonly response: Response } | ForwardFailure> {
  try {
    return { kind: "success", response: await deps.upstream(request) }
  } catch (error) {
    if (error instanceof Error) {
      return {
        kind: "failure",
        status: 502,
        keyPrefix,
        error: toOpenAiError(
          "grok_upstream_error",
          "upstream_request_failed",
          "Grok upstream request failed",
        ).error,
      }
    }
    throw error
  }
}

function isUpstreamAuthFailure(status: number): boolean {
  return status === 401 || status === 403
}
