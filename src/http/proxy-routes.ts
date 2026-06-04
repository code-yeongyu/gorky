import type { Hono } from "hono"
import type { AppDependencies } from "../app"
import { ensureFreshAccountToken } from "../domain/account-refresh"
import { selectAccountForModel } from "../domain/account-selection"
import { authenticateApiKey, readJson, toOpenAiError } from "./auth"
import { validateConfiguredModels } from "./model-validation"
import { durationSince, logProxyFailure, logProxySuccess } from "./proxy-logging"
import { recordProxyUsage } from "./proxy-usage"
import { ChatCompletionRequestSchema, ResponsesRequestSchema } from "./schemas"
import { forwardWithAuthRetry, type PreparedProxyAccount } from "./upstream-forwarding"

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
    const startedAt = deps.now()
    const parsed = ChatCompletionRequestSchema.safeParse(await readJson(c.req.raw))
    if (!parsed.success) {
      return c.json(
        toOpenAiError("invalid_request_error", "invalid_json", "Invalid request body"),
        400,
      )
    }

    const prepared = await prepareAccount(deps, c.req.raw.headers, parsed.data.model)
    if (prepared.kind === "failure") {
      logProxyFailure(
        deps,
        c.req.raw,
        c.req.path,
        prepared.status,
        parsed.data.model,
        prepared,
        durationSince(deps, startedAt),
      )
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
      logProxyFailure(
        deps,
        c.req.raw,
        c.req.path,
        upstream.status,
        parsed.data.model,
        upstream,
        durationSince(deps, startedAt),
      )
      return c.json({ error: upstream.error }, upstream.status)
    }

    const usedAt = deps.now()
    const usage = await recordProxyUsage({
      deps,
      accountId: upstream.account.id,
      keyHash: prepared.keyHash,
      usedAt,
    })
    if (usage.kind === "failure") {
      logProxyFailure(
        deps,
        c.req.raw,
        c.req.path,
        usage.status,
        parsed.data.model,
        { ...usage, keyPrefix: prepared.keyPrefix },
        durationSince(deps, startedAt),
      )
      return c.json({ error: usage.error }, usage.status)
    }
    logProxySuccess({
      deps,
      request: c.req.raw,
      path: c.req.path,
      event: "chat_completion",
      status: upstream.response.status,
      model: parsed.data.model,
      keyPrefix: prepared.keyPrefix,
      durationMs: durationSince(deps, startedAt),
    })
    return upstream.response
  })

  app.post("/v1/responses", async (c) => {
    const startedAt = deps.now()
    const parsed = ResponsesRequestSchema.safeParse(await readJson(c.req.raw))
    if (!parsed.success) {
      return c.json(
        toOpenAiError("invalid_request_error", "invalid_json", "Invalid request body"),
        400,
      )
    }

    const prepared = await prepareAccount(deps, c.req.raw.headers, parsed.data.model)
    if (prepared.kind === "failure") {
      logProxyFailure(
        deps,
        c.req.raw,
        c.req.path,
        prepared.status,
        parsed.data.model,
        prepared,
        durationSince(deps, startedAt),
      )
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
      logProxyFailure(
        deps,
        c.req.raw,
        c.req.path,
        upstream.status,
        parsed.data.model,
        upstream,
        durationSince(deps, startedAt),
      )
      return c.json({ error: upstream.error }, upstream.status)
    }

    const usedAt = deps.now()
    const usage = await recordProxyUsage({
      deps,
      accountId: upstream.account.id,
      keyHash: prepared.keyHash,
      usedAt,
    })
    if (usage.kind === "failure") {
      logProxyFailure(
        deps,
        c.req.raw,
        c.req.path,
        usage.status,
        parsed.data.model,
        { ...usage, keyPrefix: prepared.keyPrefix },
        durationSince(deps, startedAt),
      )
      return c.json({ error: usage.error }, usage.status)
    }
    logProxySuccess({
      deps,
      request: c.req.raw,
      path: c.req.path,
      event: "responses",
      status: upstream.response.status,
      model: parsed.data.model,
      keyPrefix: prepared.keyPrefix,
      durationMs: durationSince(deps, startedAt),
    })
    return upstream.response
  })
}

async function prepareAccount(
  deps: AppDependencies,
  headers: Headers,
  model: string,
): Promise<
  | PreparedProxyAccount
  | {
      readonly kind: "failure"
      readonly error: { readonly code: string; readonly type: string; readonly message: string }
      readonly status: 400 | 401 | 403 | 429 | 502 | 503
      readonly keyPrefix?: string
    }
> {
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
