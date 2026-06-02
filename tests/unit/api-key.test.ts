import { describe, expect, it } from "vitest"
import { createApiKey, verifyApiKey } from "../../src/domain/api-key"
import type { ApiKeyRecord } from "../../src/domain/types"

describe("api key token sets", () => {
  it("Given an allowed model set When key is verified Then disallowed models are rejected", async () => {
    // Given
    const created = await createApiKey({
      name: "qa-key",
      allowedModels: ["grok-composer-2.5-fast"],
      now: 1_780_000_000_000,
      secretSeed: "deterministic-seed",
    })
    const record: ApiKeyRecord = {
      id: created.record.id,
      keyHash: created.record.keyHash,
      keyPrefix: created.record.keyPrefix,
      name: created.record.name,
      allowedModels: created.record.allowedModels,
      createdAt: created.record.createdAt,
      lastUsedAt: null,
      revokedAt: null,
      deactivatedAt: null,
    }

    // When
    const allowed = await verifyApiKey({
      plaintextKey: created.plaintextKey,
      record,
      requestedModel: "grok-composer-2.5-fast",
    })
    const disallowed = await verifyApiKey({
      plaintextKey: created.plaintextKey,
      record,
      requestedModel: "grok-build",
    })

    // Then
    expect(allowed.kind).toBe("success")
    expect(disallowed.kind).toBe("failure")
    if (disallowed.kind !== "failure") {
      throw new Error("Expected model restriction to fail")
    }
    expect(disallowed.error.code).toBe("model_not_allowed")
  })
})
