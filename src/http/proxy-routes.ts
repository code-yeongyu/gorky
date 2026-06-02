import type { Hono } from "hono"
import type { AppDependencies } from "../app"
import { ensureFreshAccountToken } from "../domain/account-refresh"
import { selectAccountForModel } from "../domain/account-selection"
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
      return c.json({ error: prepared.error }, prepared.status)
    }

    const upstreamRequest = new Request(`${config.cliProxyBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${prepared.account.accessToken}`,
        "content-type": "application/json",
        "x-grok-client-version": config.grokClientVersion,
      },
      body: JSON.stringify(parsed.data),
    })
    const upstreamResponse = await deps.upstream(upstreamRequest)
    const usedAt = deps.now()
    await deps.store.touchAccount(prepared.account.id, usedAt)
    await deps.store.touchApiKey(prepared.keyHash, usedAt)
    deps.logger?.({
      event: "chat_completion",
      requestId: getRequestId(c.req.raw.headers),
      path: c.req.path,
      method: c.req.method,
      keyPrefix: prepared.keyPrefix,
      status: upstreamResponse.status,
      model: parsed.data.model,
    })
    return upstreamResponse
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
      return c.json({ error: prepared.error }, prepared.status)
    }

    const upstreamRequest = new Request(`${config.publicApiBaseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${prepared.account.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(parsed.data),
    })
    const upstreamResponse = await deps.upstream(upstreamRequest)
    const usedAt = deps.now()
    await deps.store.touchAccount(prepared.account.id, usedAt)
    await deps.store.touchApiKey(prepared.keyHash, usedAt)
    deps.logger?.({
      event: "responses",
      requestId: getRequestId(c.req.raw.headers),
      path: c.req.path,
      method: c.req.method,
      keyPrefix: prepared.keyPrefix,
      status: upstreamResponse.status,
      model: parsed.data.model,
    })
    return upstreamResponse
  })
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
    } as const
  }

  const fresh = await ensureFreshAccountToken({
    account: selected,
    client: { refresh: deps.refreshClient },
    now: deps.now(),
    store: deps.store,
  })
  if (fresh.kind === "failure") {
    return { kind: "failure", error: fresh.error, status: 502 } as const
  }

  return {
    kind: "success",
    account: fresh.account,
    keyHash: auth.record.keyHash,
    keyPrefix: auth.record.keyPrefix,
  } as const
}
