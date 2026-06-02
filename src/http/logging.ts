export type LoggerEvent = {
  readonly event: string
  readonly requestId: string
  readonly path: string
  readonly method: string
  readonly keyPrefix?: string
  readonly status?: number
  readonly model?: string
  readonly metadata?: unknown
}
