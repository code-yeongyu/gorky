import { createApp } from "./app"
import { createD1Store } from "./cloudflare/d1-store"
import { createOAuthRefreshClient } from "./cloudflare/oauth-refresh-client"
import { parseGrokModelIds } from "./domain/models"

export default {
  fetch: (request: Request, env: Env, executionContext: ExecutionContext): Promise<Response> => {
    const refreshClient = createOAuthRefreshClient({
      issuer: env.AUTH_ISSUER,
      clientId: env.OIDC_CLIENT_ID,
    })
    const app = createApp({
      store: createD1Store(env.DB, env.TOKEN_ENCRYPTION_SECRET),
      now: () => Date.now(),
      upstream: async (upstreamRequest) => fetch(upstreamRequest),
      refreshClient: refreshClient.refresh,
      adminToken: env.ADMIN_TOKEN,
      grokClientVersion: env.GROK_CLIENT_VERSION,
      cliProxyBaseUrl: env.GROK_CLI_PROXY_BASE_URL,
      publicApiBaseUrl: env.GROK_PUBLIC_API_BASE_URL,
      models: parseGrokModelIds(env.GROK_MODEL_IDS),
      logger: (event) => {
        executionContext.waitUntil(Promise.resolve(console.log(JSON.stringify(event))))
      },
    })
    return Promise.resolve(app.fetch(request, env, executionContext))
  },
}
