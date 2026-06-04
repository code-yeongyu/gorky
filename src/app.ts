import { Hono } from "hono"
import { DEFAULT_GROK_MODELS } from "./domain/models"
import type { TokenRefreshResult } from "./domain/types"
import { registerAdminRoutes } from "./http/admin-routes"
import { extractApiKey, getRequestId } from "./http/auth"
import { createRedactingLogger, type LoggerEvent } from "./http/logging"
import { registerOAuthRoutes } from "./http/oauth-routes"
import { registerProxyRoutes } from "./http/proxy-routes"
import { redactSensitiveData } from "./lib/redaction"
import type { GorkyStore } from "./store"

const DEFAULT_GROK_CLIENT_VERSION = "0.2.16"
const DEFAULT_CLI_PROXY_BASE_URL = "https://cli-chat-proxy.grok.com/v1"
const DEFAULT_PUBLIC_API_BASE_URL = "https://api.x.ai/v1"

export type AppDependencies = {
  readonly store: GorkyStore
  readonly now: () => number
  readonly upstream: (request: Request) => Promise<Response>
  readonly refreshClient: (refreshToken: string) => Promise<TokenRefreshResult>
  readonly adminToken: string
  readonly logger?: (event: LoggerEvent) => void
  readonly grokClientVersion?: string
  readonly cliProxyBaseUrl?: string
  readonly publicApiBaseUrl?: string
  readonly models?: readonly string[]
  readonly oauthIssuer?: string
  readonly oauthClientId?: string
  readonly oauthStateStore?: import("./domain/oauth").OAuthStateStore
  readonly oauthAuthorizationClient?: import("./domain/oauth").OAuthAuthorizationClient
}

export function createApp(deps: AppDependencies): Hono {
  const app = new Hono()
  const grokClientVersion = deps.grokClientVersion ?? DEFAULT_GROK_CLIENT_VERSION
  const cliProxyBaseUrl = deps.cliProxyBaseUrl ?? DEFAULT_CLI_PROXY_BASE_URL
  const publicApiBaseUrl = deps.publicApiBaseUrl ?? DEFAULT_PUBLIC_API_BASE_URL
  const models = deps.models ?? DEFAULT_GROK_MODELS
  const routeDeps = deps.logger
    ? { ...deps, logger: createRedactingLogger(deps.logger), models }
    : { ...deps, models }

  app.get("/health", (c) => c.json({ status: "ok", service: "gorky" }))

  app.get("/api/models", (c) => c.json({ models }))
  app.get("/v1/models", (c) =>
    c.json({
      object: "list",
      data: models.map((model) => ({
        id: model,
        object: "model",
        created: 0,
        owned_by: "xai",
      })),
    }),
  )

  app.get("/__qa/redaction", (c) => {
    const requestId = getRequestId(c.req.raw.headers)
    const apiKey = extractApiKey(c.req.raw.headers)
    const keyPrefix = apiKey?.slice(0, 12)
    const loggerEvent: LoggerEvent = {
      event: "qa_redaction",
      requestId,
      path: c.req.path,
      method: c.req.method,
      metadata: redactSensitiveData(Object.fromEntries(c.req.raw.headers.entries())),
    }
    routeDeps.logger?.(keyPrefix ? { ...loggerEvent, keyPrefix } : loggerEvent)
    return c.json(
      redactSensitiveData({
        requestId,
        headers: Object.fromEntries(c.req.raw.headers.entries()),
        access_token: "qa-access-token",
        refresh_token: "qa-refresh-token",
      }),
    )
  })

  registerAdminRoutes(app, routeDeps)
  registerOAuthRoutes(app, routeDeps)
  registerProxyRoutes(app, routeDeps, { cliProxyBaseUrl, grokClientVersion, publicApiBaseUrl })

  return app
}
