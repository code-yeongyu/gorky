import type { Hono } from "hono"
import type { AppDependencies } from "../app"
import { DEFAULT_GROK_MODELS } from "../domain/models"
import { createAuthorizationStart } from "../domain/oauth"
import type { AccountTokenRecord } from "../domain/types"
import { saveRegisteredAccounts } from "./admin-account-registration"
import { getRequestId, readJson, requireAdmin, toOpenAiError } from "./auth"
import { validateConfiguredModels } from "./model-validation"
import {
  deleteOAuthState,
  exchangeOAuthCode,
  getOAuthState,
  putOAuthState,
} from "./oauth-operations"
import { OAuthStartRequestSchema } from "./schemas"

const OAUTH_STATE_TTL_SECONDS = 600

export function registerOAuthRoutes(app: Hono, deps: AppDependencies): void {
  app.post("/api/admin/oauth/start", async (c) => {
    const auth = requireAdmin(c.req.raw.headers, deps.adminToken)
    if (auth) {
      logOAuthEvent(deps, c.req.raw, c.req.path, "admin_auth_failed", 401)
      return auth
    }
    if (!deps.oauthStateStore || !deps.oauthIssuer || !deps.oauthClientId) {
      logOAuthEvent(deps, c.req.raw, c.req.path, "oauth_start_failed", 501, {
        errorCode: "oauth_not_configured",
      })
      return c.json(
        toOpenAiError("invalid_request_error", "oauth_not_configured", "OAuth unavailable"),
        501,
      )
    }

    const parsed = OAuthStartRequestSchema.safeParse(await readJson(c.req.raw))
    if (!parsed.success) {
      logOAuthEvent(deps, c.req.raw, c.req.path, "oauth_start_failed", 400, {
        errorCode: "invalid_json",
      })
      return c.json(
        toOpenAiError("invalid_request_error", "invalid_json", "Invalid OAuth start body"),
        400,
      )
    }

    const requestedModelIds = parsed.data.modelIds ?? deps.models ?? DEFAULT_GROK_MODELS
    const modelValidation = validateConfiguredModels(deps, requestedModelIds)
    if (modelValidation.kind === "failure") {
      logOAuthEvent(deps, c.req.raw, c.req.path, "oauth_start_failed", 400, {
        errorCode: modelValidation.error.code,
        unknownModelIds: modelValidation.unknownModelIds,
      })
      return c.json({ error: modelValidation.error }, 400)
    }

    const start = await createAuthorizationStart({
      issuer: deps.oauthIssuer,
      clientId: deps.oauthClientId,
      redirectUri: parsed.data.redirectUri,
      modelIds: requestedModelIds,
      now: deps.now(),
    })
    const stateSaved = await putOAuthState({
      deps,
      state: start.state,
      record: start.stateRecord,
      ttlSeconds: OAUTH_STATE_TTL_SECONDS,
    })
    if (stateSaved.kind === "failure") {
      logOAuthEvent(deps, c.req.raw, c.req.path, "oauth_start_failed", 502, {
        errorCode: stateSaved.error.code,
      })
      return c.json({ error: stateSaved.error }, 502)
    }
    logOAuthEvent(deps, c.req.raw, c.req.path, "oauth_start_created", 201, {
      modelIds: start.stateRecord.modelIds,
      redirectOrigin: new URL(start.stateRecord.redirectUri).origin,
    })
    return c.json({ authorizationUrl: start.authorizationUrl, state: start.state }, 201)
  })

  app.get("/api/oauth/callback", async (c) => {
    if (!deps.oauthStateStore || !deps.oauthAuthorizationClient) {
      logOAuthEvent(deps, c.req.raw, c.req.path, "oauth_callback_failed", 501, {
        errorCode: "oauth_not_configured",
      })
      return c.json(
        toOpenAiError("invalid_request_error", "oauth_not_configured", "OAuth unavailable"),
        501,
      )
    }

    const state = c.req.query("state")
    const code = c.req.query("code")
    if (!state || !code) {
      logOAuthEvent(deps, c.req.raw, c.req.path, "oauth_callback_failed", 400, {
        errorCode: "invalid_oauth_callback",
      })
      return c.json(
        toOpenAiError("invalid_request_error", "invalid_oauth_callback", "Missing state or code"),
        400,
      )
    }

    const saved = await getOAuthState({ deps, state })
    if (saved.kind === "failure") {
      logOAuthEvent(deps, c.req.raw, c.req.path, "oauth_callback_failed", 502, {
        errorCode: saved.error.code,
      })
      return c.json({ error: saved.error }, 502)
    }
    if (!saved.value) {
      logOAuthEvent(deps, c.req.raw, c.req.path, "oauth_callback_failed", 400, {
        errorCode: "invalid_oauth_state",
      })
      return c.json(
        toOpenAiError("invalid_request_error", "invalid_oauth_state", "OAuth state expired"),
        400,
      )
    }
    const deleted = await deleteOAuthState({ deps, state })
    if (deleted.kind === "failure") {
      logOAuthEvent(deps, c.req.raw, c.req.path, "oauth_callback_failed", 502, {
        errorCode: deleted.error.code,
      })
      return c.json({ error: deleted.error }, 502)
    }

    const modelValidation = validateConfiguredModels(deps, saved.value.modelIds)
    if (modelValidation.kind === "failure") {
      logOAuthEvent(deps, c.req.raw, c.req.path, "oauth_callback_failed", 400, {
        errorCode: modelValidation.error.code,
        unknownModelIds: modelValidation.unknownModelIds,
      })
      return c.json({ error: modelValidation.error }, 400)
    }

    const exchanged = await exchangeOAuthCode({
      deps,
      code,
      codeVerifier: saved.value.codeVerifier,
      redirectUri: saved.value.redirectUri,
    })
    if (exchanged.kind === "failure") {
      logOAuthEvent(deps, c.req.raw, c.req.path, "oauth_callback_failed", 502, {
        errorCode: exchanged.error.code,
      })
      return c.json({ error: exchanged.error }, 502)
    }
    if (exchanged.value.kind === "failure") {
      logOAuthEvent(deps, c.req.raw, c.req.path, "oauth_callback_failed", 502, {
        errorCode: exchanged.value.errorCode,
        modelIds: saved.value.modelIds,
      })
      return c.json(
        toOpenAiError(
          "grok_authorization_error",
          exchanged.value.errorCode,
          "Grok authorization failed",
        ),
        502,
      )
    }

    const account = {
      id: `acct_${crypto.randomUUID()}`,
      email: exchanged.value.email,
      accessToken: exchanged.value.accessToken,
      refreshToken: exchanged.value.refreshToken,
      expiresAt: deps.now() + exchanged.value.expiresInSeconds * 1000,
      modelIds: saved.value.modelIds,
      status: "active",
      lastUsedAt: null,
    } satisfies AccountTokenRecord
    const savedAccount = await saveRegisteredAccounts(deps, [account])
    if (savedAccount.kind === "failure") {
      logOAuthEvent(deps, c.req.raw, c.req.path, "oauth_callback_failed", 502, {
        errorCode: savedAccount.error.code,
        modelIds: saved.value.modelIds,
      })
      return c.json({ error: savedAccount.error }, 502)
    }

    logOAuthEvent(deps, c.req.raw, c.req.path, "oauth_account_registered", 201, {
      accountId: account.id,
      modelIds: account.modelIds,
      status: account.status,
    })

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

function logOAuthEvent(
  deps: AppDependencies,
  request: Request,
  path: string,
  event: string,
  status: number,
  metadata?: unknown,
): void {
  deps.logger?.({
    event,
    requestId: getRequestId(request.headers),
    path,
    method: request.method,
    status,
    metadata,
  })
}
