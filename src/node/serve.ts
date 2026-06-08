import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { createApp } from "../app"
import { createOAuthAuthorizationClient } from "../cloudflare/oauth-authorization-client"
import { createOAuthRefreshClient } from "../cloudflare/oauth-refresh-client"
import { parseGrokModelIds } from "../domain/models"
import { createMemoryOAuthStateStore } from "./memory-oauth-state-store"
import { createSqliteStore } from "./sqlite-store"

function requiredEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    console.error(`Missing required env var: ${key}`)
    process.exit(1)
  }
  return value
}

const {
  AUTH_ISSUER,
  DB_PATH,
  GORKY_QA_MODE,
  GROK_CLI_PROXY_BASE_URL,
  GROK_CLIENT_VERSION,
  GROK_MODEL_IDS,
  GROK_PUBLIC_API_BASE_URL,
  OIDC_CLIENT_ID,
  PORT,
} = process.env

const port = Number(PORT ?? "8787")
const dbPath = DB_PATH ?? "gorky.sqlite"

const adminToken = requiredEnv("ADMIN_TOKEN")
const encryptionSecret = requiredEnv("TOKEN_ENCRYPTION_SECRET")
const authIssuer = AUTH_ISSUER ?? "https://auth.x.ai"
const oidcClientId = OIDC_CLIENT_ID ?? "b1a00492-073a-47ea-816f-4c329264a828"
const grokClientVersion = GROK_CLIENT_VERSION ?? "0.2.16"
const cliProxyBaseUrl = GROK_CLI_PROXY_BASE_URL ?? "https://cli-chat-proxy.grok.com/v1"
const publicApiBaseUrl = GROK_PUBLIC_API_BASE_URL ?? "https://api.x.ai/v1"
const grokModelIds = GROK_MODEL_IDS ?? "grok-composer-2.5-fast,grok-build"
const qaMode = GORKY_QA_MODE === "true"

const refreshClient = createOAuthRefreshClient({ issuer: authIssuer, clientId: oidcClientId })
const authorizationClient = createOAuthAuthorizationClient({
  issuer: authIssuer,
  clientId: oidcClientId,
})

const app = createApp({
  store: createSqliteStore(dbPath, encryptionSecret),
  now: () => Date.now(),
  upstream: async (request) => fetch(request),
  refreshClient: refreshClient.refresh,
  adminToken,
  grokClientVersion,
  cliProxyBaseUrl,
  publicApiBaseUrl,
  models: parseGrokModelIds(grokModelIds),
  oauthIssuer: authIssuer,
  oauthClientId: oidcClientId,
  oauthStateStore: createMemoryOAuthStateStore(),
  oauthAuthorizationClient: authorizationClient,
  qaMode,
  logger: (event) => {
    console.log(JSON.stringify(event))
  },
})

app.get("/register-account", serveStatic({ path: "./apps/web/dist/index.html" }))
app.get("/register-account/*", serveStatic({ path: "./apps/web/dist/index.html" }))
app.use("/*", serveStatic({ root: "./apps/web/dist" }))

console.log(`Gorky (node) listening on http://localhost:${port}`)

serve({ fetch: app.fetch, port })
