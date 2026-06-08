import type { AppDependencies } from "../app"
import type { AccountTokenRecord, ApiKeyRecord } from "../domain/types"
import { getRequestId } from "./auth"

export function redactAccount(account: AccountTokenRecord) {
  return {
    id: account.id,
    email: account.email,
    principalType: "User",
    expiresAt: account.expiresAt,
    modelIds: account.modelIds,
    status: account.status,
    lastUsedAt: account.lastUsedAt,
    priority: account.priority ?? 100,
  }
}

export function redactApiKey(key: ApiKeyRecord) {
  return {
    id: key.id,
    keyPrefix: key.keyPrefix,
    name: key.name,
    allowedModels: key.allowedModels,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
    deactivatedAt: key.deactivatedAt,
  }
}

export function logAdminEvent(
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
