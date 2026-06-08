import type { Hono } from "hono"
import type { AppDependencies } from "../app"
import { DEFAULT_GROK_MODELS } from "../domain/models"
import { createAuthorizationStart, isGrokCliLoopbackRedirectUri } from "../domain/oauth"
import type { AccountTokenRecord } from "../domain/types"
import { saveRegisteredAccounts } from "./admin-account-registration"
import { getRequestId, readJson, toOpenAiError } from "./auth"
import { validateConfiguredModels } from "./model-validation"
import {
  deleteOAuthState,
  exchangeOAuthCode,
  getOAuthState,
  putOAuthState,
} from "./oauth-operations"
import { RegisterOAuthCallbackRequestSchema, RegisterOAuthStartRequestSchema } from "./schemas"

const OAUTH_STATE_TTL_SECONDS = 600
const REGISTER_REDIRECT_URI = "http://127.0.0.1:8787/callback"

export function registerAccountRoutes(app: Hono, deps: AppDependencies): void {
  app.post("/api/register-account/oauth/start", async (c) => {
    const parsed = RegisterOAuthStartRequestSchema.safeParse(await readJson(c.req.raw))
    if (!parsed.success) {
      logRegisterAccountEvent(deps, c.req.raw, c.req.path, "register_oauth_start_failed", 400, {
        errorCode: "invalid_json",
      })
      return c.json(
        toOpenAiError("invalid_request_error", "invalid_json", "Invalid registration OAuth body"),
        400,
      )
    }
    if (!deps.oauthStateStore || !deps.oauthIssuer || !deps.oauthClientId) {
      return c.json(
        toOpenAiError("invalid_request_error", "oauth_not_configured", "OAuth unavailable"),
        501,
      )
    }

    const requestedModelIds = parsed.data.modelIds ?? deps.models ?? DEFAULT_GROK_MODELS
    const modelValidation = validateConfiguredModels(deps, requestedModelIds)
    if (modelValidation.kind === "failure") {
      return c.json({ error: modelValidation.error }, 400)
    }

    const start = await createAuthorizationStart({
      issuer: deps.oauthIssuer,
      clientId: deps.oauthClientId,
      redirectUri: REGISTER_REDIRECT_URI,
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
      return c.json({ error: stateSaved.error }, 502)
    }

    logRegisterAccountEvent(deps, c.req.raw, c.req.path, "register_oauth_start_created", 201, {
      modelIds: start.stateRecord.modelIds,
    })
    return c.json(
      {
        authorizationUrl: start.authorizationUrl,
        state: start.state,
        redirectUri: REGISTER_REDIRECT_URI,
      },
      201,
    )
  })

  app.post("/api/register-account/oauth/callback", async (c) => {
    const parsed = RegisterOAuthCallbackRequestSchema.safeParse(await readJson(c.req.raw))
    if (!parsed.success) {
      return c.json(
        toOpenAiError(
          "invalid_request_error",
          "invalid_json",
          "Invalid registration callback body",
        ),
        400,
      )
    }
    const callback = parseLoopbackCallbackUrl(parsed.data.callbackUrl)
    if (callback.kind === "failure") {
      return c.json(toOpenAiError("invalid_request_error", callback.code, callback.message), 400)
    }

    const account = await registerCallbackAccount({
      deps,
      state: callback.state,
      code: callback.code,
    })
    if (account.kind === "failure") {
      return c.json({ error: account.error }, account.status)
    }

    logRegisterAccountEvent(deps, c.req.raw, c.req.path, "register_oauth_account_created", 201, {
      accountId: account.account.id,
      modelIds: account.account.modelIds,
    })
    return c.json(
      {
        id: account.account.id,
        email: account.account.email,
        principalType: "User",
        expiresAt: account.account.expiresAt,
        modelIds: account.account.modelIds,
        status: account.account.status,
        lastUsedAt: account.account.lastUsedAt,
        priority: account.account.priority ?? 100,
      },
      201,
    )
  })
}

function parseLoopbackCallbackUrl(
  value: string,
):
  | { readonly kind: "success"; readonly code: string; readonly state: string }
  | { readonly kind: "failure"; readonly code: string; readonly message: string } {
  if (!isGrokCliLoopbackRedirectUri(value)) {
    return {
      kind: "failure",
      code: "unsupported_oauth_callback_url",
      message: "Paste the localhost callback URL from the X login redirect.",
    }
  }
  const url = new URL(value)
  const code = url.searchParams.get("code")?.trim()
  const state = url.searchParams.get("state")?.trim()
  if (!code || !state) {
    return {
      kind: "failure",
      code: "invalid_oauth_callback",
      message: "Callback URL must include code and state.",
    }
  }
  return { kind: "success", code, state }
}

async function registerCallbackAccount(input: {
  readonly deps: AppDependencies
  readonly state: string
  readonly code: string
}): Promise<
  | { readonly kind: "success"; readonly account: AccountTokenRecord }
  | { readonly kind: "failure"; readonly error: unknown; readonly status: 400 | 502 }
> {
  const saved = await getOAuthState({ deps: input.deps, state: input.state })
  if (saved.kind === "failure") return { kind: "failure", error: saved.error, status: 502 }
  if (!saved.value) {
    return {
      kind: "failure",
      status: 400,
      error: {
        type: "invalid_request_error",
        code: "invalid_oauth_state",
        message: "OAuth state expired",
      },
    }
  }
  const deleted = await deleteOAuthState({ deps: input.deps, state: input.state })
  if (deleted.kind === "failure") return { kind: "failure", error: deleted.error, status: 502 }

  const exchanged = await exchangeOAuthCode({
    deps: input.deps,
    code: input.code,
    codeVerifier: saved.value.codeVerifier,
    redirectUri: saved.value.redirectUri,
  })
  if (exchanged.kind === "failure") return { kind: "failure", error: exchanged.error, status: 502 }
  if (exchanged.value.kind === "failure") {
    return {
      kind: "failure",
      status: 502,
      error: {
        type: "grok_authorization_error",
        code: exchanged.value.errorCode,
        message: "Grok authorization failed",
      },
    }
  }

  const account = {
    id: `acct_${crypto.randomUUID()}`,
    email: exchanged.value.email,
    accessToken: exchanged.value.accessToken,
    refreshToken: exchanged.value.refreshToken,
    expiresAt: input.deps.now() + exchanged.value.expiresInSeconds * 1000,
    modelIds: saved.value.modelIds,
    status: "active",
    lastUsedAt: null,
    priority: 100,
  } satisfies AccountTokenRecord
  const savedAccount = await saveRegisteredAccounts(input.deps, [account])
  if (savedAccount.kind === "failure") {
    return { kind: "failure", error: savedAccount.error, status: 502 }
  }
  return { kind: "success", account }
}

function logRegisterAccountEvent(
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
