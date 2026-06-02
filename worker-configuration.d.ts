interface Env {
  readonly DB: D1Database
  readonly LOGIN_STATE: KVNamespace
  readonly GROK_CLIENT_VERSION: string
  readonly GROK_CLI_PROXY_BASE_URL: string
  readonly GROK_PUBLIC_API_BASE_URL: string
  readonly AUTH_ISSUER: string
  readonly OIDC_CLIENT_ID: string
  readonly ADMIN_TOKEN: string
  readonly TOKEN_ENCRYPTION_SECRET: string
  readonly GORKY_QA_MODE: string
}
