import type { Hono } from "hono"
import type { AppDependencies } from "../app"
import { readJson, toOpenAiError } from "./auth"
import { prepareAccount } from "./proxy-account"
import { durationSince, logProxyFailure, logProxySuccess } from "./proxy-logging"
import { recordProxyUsage } from "./proxy-usage"
import { ChatCompletionRequestSchema, ResponsesRequestSchema } from "./schemas"
import { forwardWithAuthRetry } from "./upstream-forwarding"

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
            "user-agent": `grok/${config.grokClientVersion}`,
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
            "user-agent": `grok/${config.grokClientVersion}`,
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
