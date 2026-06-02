import { createApp } from "../src/app"
import type { TokenRefreshResult } from "../src/domain/types"
import { createMemoryStore } from "../src/testing/memory-store"

const store = createMemoryStore({ accounts: [], apiKeys: [] })

const app = createApp({
  store,
  adminToken: "dev-admin-token",
  now: () => Date.now(),
  upstream: async (request) => {
    return Response.json({
      qa_upstream: {
        url: request.url,
        authorization: request.headers.get("Authorization"),
        grokClientVersion: request.headers.get("x-grok-client-version"),
        body: await request.text(),
      },
      choices: [{ message: { content: "pong" } }],
    })
  },
  refreshClient: async (refreshToken): Promise<TokenRefreshResult> => {
    if (refreshToken === "fail-refresh") {
      return {
        kind: "failure",
        errorCode: "invalid_grant",
        message: "QA refresh failure",
      }
    }
    return {
      kind: "success",
      accessToken: "refreshed-access-token",
      refreshToken: "rotated-refresh-token",
      expiresInSeconds: 21_600,
    }
  },
  logger: (event) => {
    console.log(JSON.stringify(event))
  },
})

Bun.serve({
  port: 8787,
  hostname: "127.0.0.1",
  fetch: app.fetch,
})

console.log("gorky qa server listening on http://127.0.0.1:8787")
