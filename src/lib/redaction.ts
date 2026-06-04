const SENSITIVE_KEYS = new Set([
  "authorization",
  "x-api-key",
  "x-admin-token",
  "access_token",
  "refresh_token",
  "id_token",
  "apiKey",
  "adminToken",
  "client_secret",
  "key",
  "password",
  "refreshToken",
  "accessToken",
])

const SECRET_STRING_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/g,
  /\bgorky_(?![0-9a-f]{6}\b)[A-Za-z0-9._-]+/g,
  /\b(?:access_token|refresh_token|id_token|client_secret)=([^&\s]+)/g,
] as const

export function redactSensitiveData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item))
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).map(([key, entryValue]) => {
      if (SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(key.toLowerCase())) {
        return [key, "[REDACTED]"] as const
      }
      return [key, redactSensitiveData(entryValue)] as const
    })
    return Object.fromEntries(entries)
  }

  if (typeof value === "string") {
    return redactSensitiveString(value)
  }

  return value
}

function redactSensitiveString(value: string): string {
  return SECRET_STRING_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, "[REDACTED]"),
    value,
  )
}
