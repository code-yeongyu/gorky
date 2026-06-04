import { hashApiKey, verifyApiKey } from "../domain/api-key"
import type { ApiError, ApiKeyRecord } from "../domain/types"
import type { GorkyStore } from "../store"

export type AuthenticationResult =
  | { readonly kind: "success"; readonly record: ApiKeyRecord }
  | { readonly kind: "failure"; readonly error: ApiError; readonly status: 401 | 403 | 429 | 502 }

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
  const record = await findApiKeyByHash(store, keyHash)
  if (record.kind === "failure") {
    return record
  }
  if (!record.record) {
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

  const verified = await verifyApiKey({ plaintextKey, record: record.record, requestedModel })
  if (verified.kind === "failure") {
    return {
      kind: "failure",
      status: verified.error.code === "key_deactivated" ? 429 : 403,
      error: verified.error,
    }
  }

  return { kind: "success", record: record.record }
}

async function findApiKeyByHash(
  store: GorkyStore,
  keyHash: string,
): Promise<
  | { readonly kind: "success"; readonly record: ApiKeyRecord | null }
  | { readonly kind: "failure"; readonly error: ApiError; readonly status: 502 }
> {
  try {
    return { kind: "success", record: await store.findApiKeyByHash(keyHash) }
  } catch (error) {
    if (error instanceof Error) {
      return {
        kind: "failure",
        status: 502,
        error: {
          type: "gorky_storage_error",
          code: "api_key_lookup_failed",
          message: "API key lookup failed",
        },
      }
    }
    throw error
  }
}

export function requireAdmin(headers: Headers, adminToken: string): Response | null {
  const configuredAdminToken = adminToken.trim()
  if (configuredAdminToken.length > 0 && headers.get("x-admin-token") === configuredAdminToken) {
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
  const direct = headers.get("x-api-key")?.trim()
  if (direct) {
    return direct
  }

  const authorization = headers.get("Authorization")
  const prefix = "Bearer "
  if (authorization?.toLowerCase().startsWith(prefix.toLowerCase())) {
    const bearer = authorization.slice(prefix.length).trim()
    return bearer.length > 0 ? bearer : null
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
  const requestId = headers.get("x-request-id")?.trim()
  return requestId ? requestId : crypto.randomUUID()
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
