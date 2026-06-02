import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app"
import type { TokenRefreshResult } from "../../src/domain/types"
import { createMemoryStore } from "../../src/testing/memory-store"

describe("models route", () => {
  it("Given service is running When models are requested Then observed Grok CLI models are returned", async () => {
    // Given
    const app = createApp({
      store: createMemoryStore({ accounts: [], apiKeys: [] }),
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      upstream: async () => Response.json({ ok: true }),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "unused",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
    })

    // When
    const response = await app.request("/api/models")
    const body = await response.json()

    // Then
    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      models: ["grok-composer-2.5-fast", "grok-build"],
    })
  })

  it("Given Grok CLI custom model discovery When v1 models are requested Then OpenAI list shape is returned", async () => {
    // Given
    const app = createApp({
      store: createMemoryStore({ accounts: [], apiKeys: [] }),
      adminToken: "dev-admin-token",
      now: () => 1_780_000_000_000,
      upstream: async () => Response.json({ ok: true }),
      refreshClient: async (): Promise<TokenRefreshResult> => ({
        kind: "success",
        accessToken: "unused",
        refreshToken: null,
        expiresInSeconds: 21_600,
      }),
    })

    // When
    const response = await app.request("/v1/models")
    const body = await response.json()

    // Then
    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      object: "list",
      data: [
        { id: "grok-composer-2.5-fast", object: "model", owned_by: "xai" },
        { id: "grok-build", object: "model", owned_by: "xai" },
      ],
    })
  })
})
