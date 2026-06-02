import type { Hono } from "hono"
import type { AppDependencies } from "../app"
import { DEFAULT_GROK_MODELS } from "../domain/models"
import { createAuthorizationStart } from "../domain/oauth"
import type { AccountTokenRecord } from "../domain/types"
import { readJson, requireAdmin, toOpenAiError } from "./auth"
import { OAuthStartRequestSchema } from "./schemas"

const OAUTH_STATE_TTL_SECONDS = 600

export function registerOAuthRoutes(app: Hono, deps: AppDependencies): void {
  app.post("/api/admin/oauth/start", async (c) => {
    const auth = requireAdmin(c.req.raw.headers, deps.adminToken)
    if (auth) {
      return auth
    }
    if (!deps.oauthStateStore || !deps.oauthIssuer || !deps.oauthClientId) {
      return c.json(
        toOpenAiError("invalid_request_error", "oauth_not_configured", "OAuth unavailable"),
        501,
      )
    }

    const parsed = OAuthStartRequestSchema.safeParse(await readJson(c.req.raw))
    if (!parsed.success) {
      return c.json(
        toOpenAiError("invalid_request_error", "invalid_json", "Invalid OAuth start body"),
        400,
      )
    }

    const start = await createAuthorizationStart({
      issuer: deps.oauthIssuer,
      clientId: deps.oauthClientId,
      redirectUri: parsed.data.redirectUri,
      modelIds: parsed.data.modelIds ?? deps.models ?? DEFAULT_GROK_MODELS,
      now: deps.now(),
    })
    await deps.oauthStateStore.put(start.state, start.stateRecord, OAUTH_STATE_TTL_SECONDS)
    return c.json({ authorizationUrl: start.authorizationUrl, state: start.state }, 201)
  })

  app.get("/api/oauth/callback", async (c) => {
    if (!deps.oauthStateStore || !deps.oauthAuthorizationClient) {
      return c.json(
        toOpenAiError("invalid_request_error", "oauth_not_configured", "OAuth unavailable"),
        501,
      )
    }

    const state = c.req.query("state")
    const code = c.req.query("code")
    if (!state || !code) {
      return c.json(
        toOpenAiError("invalid_request_error", "invalid_oauth_callback", "Missing state or code"),
        400,
      )
    }

    const saved = await deps.oauthStateStore.get(state)
    if (!saved) {
      return c.json(
        toOpenAiError("invalid_request_error", "invalid_oauth_state", "OAuth state expired"),
        400,
      )
    }

    const exchanged = await deps.oauthAuthorizationClient.exchangeCode({
      code,
      codeVerifier: saved.codeVerifier,
      redirectUri: saved.redirectUri,
    })
    if (exchanged.kind === "failure") {
      return c.json(
        toOpenAiError("grok_authorization_error", exchanged.errorCode, exchanged.message),
        502,
      )
    }

    const account = {
      id: `acct_${crypto.randomUUID()}`,
      email: exchanged.email,
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken,
      expiresAt: deps.now() + exchanged.expiresInSeconds * 1000,
      modelIds: saved.modelIds,
      status: "active",
      lastUsedAt: null,
    } satisfies AccountTokenRecord
    await deps.store.saveAccount(account)
    await deps.oauthStateStore.delete(state)

    return c.json(
      {
        id: account.id,
        email: account.email,
        principalType: "User",
        expiresAt: account.expiresAt,
        modelIds: account.modelIds,
        status: account.status,
        lastUsedAt: account.lastUsedAt,
      },
      201,
    )
  })
}
