import { hashApiKey, verifyApiKey } from "../domain/api-key"
import type { ApiError, ApiKeyRecord } from "../domain/types"
import type { GorkyStore } from "../store"

export type AuthenticationResult =
  | { readonly kind: "success"; readonly record: ApiKeyRecord }
  | { readonly kind: "failure"; readonly error: ApiError; readonly status: 401 | 403 | 429 }

export async function authenticateApiKey(
  store: GorkyStore,
  headers: Headers,
  requestedModel: string,
): Promise<AuthenticationResult> {
  const plaintextKey = extractApiKey(headers)
  if (!plaintextKey) {
    return {
      kind: "failure",
      status: 401,
      error: {
        type: "authentication_error",
        code: "missing_api_key",
        message: "Missing API key",
      },
    }
  }

  const keyHash = await hashApiKey(plaintextKey)
  const record = await store.findApiKeyByHash(keyHash)
  if (!record) {
    return {
      kind: "failure",
      status: 401,
      error: {
        type: "authentication_error",
        code: "invalid_api_key",
        message: "Invalid API key",
      },
    }
  }

  const verified = await verifyApiKey({ plaintextKey, record, requestedModel })
  if (verified.kind === "failure") {
    return {
      kind: "failure",
      status: verified.error.code === "key_deactivated" ? 429 : 403,
      error: verified.error,
    }
  }

  return { kind: "success", record }
}

export function requireAdmin(headers: Headers, adminToken: string): Response | null {
  if (adminToken.trim().length > 0 && headers.get("x-admin-token") === adminToken) {
    return null
  }
  return Response.json(
    toOpenAiError("authentication_error", "invalid_admin_token", "Invalid admin"),
    {
      status: 401,
    },
  )
}

export function extractApiKey(headers: Headers): string | null {
  const direct = headers.get("x-api-key")
  if (direct) {
    return direct
  }

  const authorization = headers.get("Authorization")
  const prefix = "Bearer "
  if (authorization?.toLowerCase().startsWith(prefix.toLowerCase())) {
    return authorization.slice(prefix.length)
  }

  return null
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null
    }
    throw error
  }
}

export function getRequestId(headers: Headers): string {
  return headers.get("x-request-id") ?? crypto.randomUUID()
}

export function toOpenAiError(
  type: string,
  code: string,
  message: string,
): { readonly error: ApiError } {
  return {
    error: {
      type,
      code,
      message,
    },
  }
}
