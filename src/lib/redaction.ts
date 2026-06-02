const SENSITIVE_KEYS = new Set([
  "authorization",
  "x-api-key",
  "x-admin-token",
  "access_token",
  "refresh_token",
  "id_token",
  "key",
  "refreshToken",
  "accessToken",
])

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

  return value
}
