import type { ApiKeyRecord, ApiKeyVerificationResult } from "./types"

type CreateApiKeyInput = {
  readonly name: string
  readonly allowedModels: readonly string[]
  readonly now: number
  readonly secretSeed?: string
}

type CreatedApiKey = {
  readonly plaintextKey: string
  readonly record: ApiKeyRecord
}

type VerifyApiKeyInput = {
  readonly plaintextKey: string
  readonly record: ApiKeyRecord
  readonly requestedModel: string
}

export async function createApiKey(input: CreateApiKeyInput): Promise<CreatedApiKey> {
  const secretPart = input.secretSeed ?? crypto.randomUUID()
  const digest = await sha256Hex(`${input.name}:${input.now}:${secretPart}`)
  const plaintextKey = `gorky_${digest.slice(0, 40)}`
  const keyHash = await hashApiKey(plaintextKey)
  const keyPrefix = plaintextKey.slice(0, 12)

  return {
    plaintextKey,
    record: {
      id: `key_${digest.slice(0, 16)}`,
      keyHash,
      keyPrefix,
      name: input.name,
      allowedModels: input.allowedModels,
      createdAt: input.now,
      lastUsedAt: null,
      revokedAt: null,
      deactivatedAt: null,
    },
  }
}

export async function verifyApiKey(input: VerifyApiKeyInput): Promise<ApiKeyVerificationResult> {
  const keyHash = await hashApiKey(input.plaintextKey)

  if (keyHash !== input.record.keyHash) {
    return {
      kind: "failure",
      error: {
        type: "authentication_error",
        code: "invalid_api_key",
        message: "Invalid API key",
      },
    }
  }

  if (input.record.revokedAt !== null) {
    return {
      kind: "failure",
      error: {
        type: "authentication_error",
        code: "key_revoked",
        message: "API key is revoked",
      },
    }
  }

  if (input.record.deactivatedAt !== null) {
    return {
      kind: "failure",
      error: {
        type: "rate_limit_error",
        code: "key_deactivated",
        message: "API key is deactivated",
      },
    }
  }

  if (!input.record.allowedModels.includes(input.requestedModel)) {
    return {
      kind: "failure",
      error: {
        type: "invalid_request_error",
        code: "model_not_allowed",
        message: "API key is not allowed to use the requested model",
      },
    }
  }

  return { kind: "success", record: input.record }
}

export async function hashApiKey(value: string): Promise<string> {
  return sha256Hex(value)
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}
