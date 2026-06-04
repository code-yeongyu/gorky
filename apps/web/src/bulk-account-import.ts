import type { ManualAccountInput } from "./api"

type BatchParseResult =
  | { readonly kind: "success"; readonly accounts: readonly ManualAccountInput[] }
  | { readonly kind: "failure"; readonly message: string }

export function parseManualAccountBatch(text: string): BatchParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { kind: "failure", message: "Accounts JSON is invalid." }
    }
    throw error
  }

  if (!Array.isArray(parsed)) {
    return { kind: "failure", message: "Accounts JSON must be an array." }
  }

  const accounts: ManualAccountInput[] = []
  for (const item of parsed) {
    const account = manualAccountFromUnknown(item)
    if (!account) {
      return { kind: "failure", message: "Every account needs email, tokens, expiry, and models." }
    }
    accounts.push(account)
  }

  if (accounts.length === 0) {
    return { kind: "failure", message: "Accounts JSON must include at least one account." }
  }

  return { kind: "success", accounts }
}

function manualAccountFromUnknown(value: unknown): ManualAccountInput | null {
  if (typeof value !== "object" || value === null) {
    return null
  }

  const email = stringFromUnknown(Reflect.get(value, "email"))
  const accessToken = stringFromUnknown(Reflect.get(value, "accessToken"))
  const refreshToken = stringFromUnknown(Reflect.get(value, "refreshToken"))
  const expiresAt = numberFromUnknown(Reflect.get(value, "expiresAt"))
  const modelIds = stringArrayFromUnknown(Reflect.get(value, "modelIds"))

  if (!email || !accessToken || !refreshToken || !expiresAt || !modelIds) {
    return null
  }

  return { email, accessToken, refreshToken, expiresAt, modelIds }
}

function stringFromUnknown(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function numberFromUnknown(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null
}

function stringArrayFromUnknown(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const result: string[] = []
  for (const item of value) {
    const parsed = stringFromUnknown(item)
    if (!parsed) {
      return null
    }
    result.push(parsed)
  }
  return result.length ? [...new Set(result)] : null
}
