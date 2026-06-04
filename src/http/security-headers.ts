import type { Hono } from "hono"

const SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; worker-src 'self'",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const

const NO_STORE_PATH_PREFIXES = ["/api/", "/v1/"] as const

export function registerSecurityHeaders(app: Hono): void {
  app.use("*", async (c, next) => {
    await next()
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      c.header(name, value)
    }
    if (NO_STORE_PATH_PREFIXES.some((pathPrefix) => c.req.path.startsWith(pathPrefix))) {
      c.header("cache-control", "no-store")
    }
  })
}
