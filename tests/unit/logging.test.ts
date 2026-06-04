import { describe, expect, it } from "vitest"
import { createRedactingLogger, type LoggerEvent } from "../../src/http/logging"

describe("createRedactingLogger", () => {
  it("Given logger metadata contains secrets When event is emitted Then raw values are redacted", () => {
    // Given
    const events: unknown[] = []
    const logger = createRedactingLogger((event: LoggerEvent) => {
      events.push(event)
    })

    // When
    logger({
      event: "qa",
      requestId: "req_1",
      path: "/qa",
      method: "GET",
      metadata: {
        Authorization: "Bearer SENSITIVE_ACCESS_SENTINEL",
        nested: {
          refreshToken: "SENSITIVE_REFRESH_SENTINEL",
        },
      },
    })
    const text = JSON.stringify(events)

    // Then
    expect(text).toContain("[REDACTED]")
    expect(text).not.toContain("SENSITIVE_ACCESS_SENTINEL")
    expect(text).not.toContain("SENSITIVE_REFRESH_SENTINEL")
  })
})
