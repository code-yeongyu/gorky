import type { Hono } from "hono"
import type { AppDependencies } from "../app"
import { ensureFreshAccountToken } from "../domain/account-refresh"
import { selectAccountForModel } from "../domain/account-selection"
import type { AccountTokenRecord, ApiError } from "../domain/types"
import { authenticateApiKey, getRequestId, readJson, toOpenAiError } from "./auth"
import { ChatCompletionRequestSchema, ResponsesRequestSchema } from "./schemas"

export type ProxyRouteConfig = {
  readonly grokClientVersion: string
  readonly cliProxyBaseUrl: string
  readonly publicApiBaseUrl: string
}

export function registerProxyRoutes(
  app: Hono,
  deps: AppDependencies,
  config: ProxyRouteConfig,
): void {
  app.post("/v1/chat/completions", async (c) => {
    const parsed = ChatCompletionRequestSchema.safeParse(await readJson(c.req.raw))
    if (!parsed.success) {
      return c.json(
        toOpenAiError("invalid_request_error", "invalid_json", "Invalid request body"),
        400,
      )
    }

    const prepared = await prepareAccount(deps, c.req.raw.headers, parsed.data.model)
    if (prepared.kind === "failure") {
      logProxyFailure(deps, c.req.raw, c.req.path, prepared.status, parsed.data.model, prepared)
      return c.json({ error: prepared.error }, prepared.status)
    }

    const upstream = await forwardWithAuthRetry({
      deps,
      request: c.req.raw,
      path: c.req.path,
      model: parsed.data.model,
      prepared,
      createRequest: (accessToken) =>
        new Request(`${config.cliProxyBaseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-XAI-Token-Auth": "xai-grok-cli",
            "content-type": "application/json",
            "x-grok-client-version": config.grokClientVersion,
            "x-grok-model-override": parsed.data.model,
          },
          body: JSON.stringify(parsed.data),
        }),
    })
    if (upstream.kind === "failure") {
      logProxyFailure(deps, c.req.raw, c.req.path, upstream.status, parsed.data.model, upstream)
      return c.json({ error: upstream.error }, upstream.status)
    }

    const usedAt = deps.now()
    await deps.store.touchAccount(upstream.account.id, usedAt)
    await deps.store.touchApiKey(prepared.keyHash, usedAt)
    deps.logger?.({
      event: "chat_completion",
      requestId: getRequestId(c.req.raw.headers),
      path: c.req.path,
      method: c.req.method,
      keyPrefix: prepared.keyPrefix,
      status: upstream.response.status,
      model: parsed.data.model,
    })
    return upstream.response
  })

  app.post("/v1/responses", async (c) => {
    const parsed = ResponsesRequestSchema.safeParse(await readJson(c.req.raw))
    if (!parsed.success) {
      return c.json(
        toOpenAiError("invalid_request_error", "invalid_json", "Invalid request body"),
        400,
      )
    }

    const prepared = await prepareAccount(deps, c.req.raw.headers, parsed.data.model)
    if (prepared.kind === "failure") {
      logProxyFailure(deps, c.req.raw, c.req.path, prepared.status, parsed.data.model, prepared)
      return c.json({ error: prepared.error }, prepared.status)
    }

    const upstream = await forwardWithAuthRetry({
      deps,
      request: c.req.raw,
      path: c.req.path,
      model: parsed.data.model,
      prepared,
      createRequest: (accessToken) =>
        new Request(`${config.publicApiBaseUrl}/responses`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(parsed.data),
        }),
    })
    if (upstream.kind === "failure") {
      logProxyFailure(deps, c.req.raw, c.req.path, upstream.status, parsed.data.model, upstream)
      return c.json({ error: upstream.error }, upstream.status)
    }

    const usedAt = deps.now()
    await deps.store.touchAccount(upstream.account.id, usedAt)
    await deps.store.touchApiKey(prepared.keyHash, usedAt)
    deps.logger?.({
      event: "responses",
      requestId: getRequestId(c.req.raw.headers),
      path: c.req.path,
      method: c.req.method,
      keyPrefix: prepared.keyPrefix,
      status: upstream.response.status,
      model: parsed.data.model,
    })
    return upstream.response
  })
}

type PreparedAccount = {
  readonly kind: "success"
  readonly account: AccountTokenRecord
  readonly keyHash: string
  readonly keyPrefix: string
}

async function forwardWithAuthRetry(input: {
  readonly deps: AppDependencies
  readonly request: Request
  readonly path: string
  readonly model: string
  readonly prepared: PreparedAccount
  readonly createRequest: (accessToken: string) => Request
}): Promise<
  | { readonly kind: "success"; readonly response: Response; readonly account: AccountTokenRecord }
  | {
      readonly kind: "failure"
      readonly error: ApiError
      readonly status: 502
      readonly keyPrefix: string
    }
> {
  const firstResponse = await input.deps.upstream(
    input.createRequest(input.prepared.account.accessToken),
  )
  if (!isUpstreamAuthFailure(firstResponse.status)) {
    return { kind: "success", response: firstResponse, account: input.prepared.account }
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
    status: firstResponse.status,
    model: input.model,
    metadata: {
      upstreamStatus: firstResponse.status,
    },
  })

  const retryResponse = await input.deps.upstream(
    input.createRequest(refreshed.account.accessToken),
  )
  return { kind: "success", response: retryResponse, account: refreshed.account }
}

function isUpstreamAuthFailure(status: number): boolean {
  return status === 401 || status === 403
}

async function prepareAccount(deps: AppDependencies, headers: Headers, model: string) {
  const auth = await authenticateApiKey(deps.store, headers, model)
  if (auth.kind === "failure") {
    return { kind: "failure", error: auth.error, status: auth.status } as const
  }

  const selected = selectAccountForModel(await deps.store.listAccounts(), model)
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

function logProxyFailure(
  deps: AppDependencies,
  request: Request,
  path: string,
  status: number,
  model: string,
  failure: {
    readonly error: { readonly code: string; readonly type: string }
    readonly keyPrefix?: string
  },
): void {
  const event = {
    event: "proxy_request_failed",
    requestId: getRequestId(request.headers),
    path,
    method: request.method,
    status,
    model,
    metadata: {
      errorCode: failure.error.code,
      errorType: failure.error.type,
    },
  }
  deps.logger?.(failure.keyPrefix ? { ...event, keyPrefix: failure.keyPrefix } : event)
}
