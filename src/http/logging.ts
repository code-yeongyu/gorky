import { redactSensitiveData } from "../lib/redaction"

export type LoggerEvent = {
  readonly event: string
  readonly requestId: string
  readonly path: string
  readonly method: string
  readonly keyPrefix?: string
  readonly status?: number
  readonly model?: string
  readonly durationMs?: number
  readonly metadata?: unknown
}

export type Logger = (event: LoggerEvent) => void

export function createRedactingLogger(logger: Logger): Logger {
  return (event) => {
    logger({
      ...event,
      metadata: redactSensitiveData(event.metadata),
    })
  }
}
