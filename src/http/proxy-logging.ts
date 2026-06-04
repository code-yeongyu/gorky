import type { AppDependencies } from "../app"
import { getRequestId } from "./auth"

export function logProxyFailure(
  deps: AppDependencies,
  request: Request,
  path: string,
  status: number,
  model: string,
  failure: {
    readonly error: { readonly code: string; readonly type: string }
    readonly keyPrefix?: string
  },
  durationMs: number,
): void {
  const event = {
    event: "proxy_request_failed",
    requestId: getRequestId(request.headers),
    path,
    method: request.method,
    status,
    model,
    durationMs,
    metadata: {
      errorCode: failure.error.code,
      errorType: failure.error.type,
    },
  }
  deps.logger?.(failure.keyPrefix ? { ...event, keyPrefix: failure.keyPrefix } : event)
}

export function logProxySuccess(input: {
  readonly deps: AppDependencies
  readonly request: Request
  readonly path: string
  readonly event: "chat_completion" | "responses"
  readonly status: number
  readonly model: string
  readonly keyPrefix: string
  readonly durationMs: number
}): void {
  input.deps.logger?.({
    event: input.event,
    requestId: getRequestId(input.request.headers),
    path: input.path,
    method: input.request.method,
    keyPrefix: input.keyPrefix,
    status: input.status,
    model: input.model,
    durationMs: input.durationMs,
  })
}

export function durationSince(deps: AppDependencies, startedAt: number): number {
  return Math.max(0, deps.now() - startedAt)
}
