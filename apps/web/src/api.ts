export type AccountStatus = "active" | "refresh_failed" | "disabled"

export type AccountRow = {
  readonly id: string
  readonly email: string
  readonly status: AccountStatus
  readonly expiresAt: number
  readonly modelIds: readonly string[]
  readonly lastUsedAt: number | null
}

export type CreateKeyResponse = {
  readonly plaintextKey: string
  readonly keyPrefix: string
  readonly allowedModels: readonly string[]
}

export async function fetchModels(): Promise<readonly string[]> {
  const body = await requestJson<{ readonly models: readonly string[] }>("/api/models", {
    method: "GET",
  })
  return body.models
}

export async function fetchAccounts(adminToken: string): Promise<readonly AccountRow[]> {
  const body = await requestJson<{ readonly accounts: readonly AccountRow[] }>(
    "/api/admin/accounts",
    {
      method: "GET",
      adminToken,
    },
  )
  return body.accounts
}

export async function requestJson<T = unknown>(
  path: string,
  input: { readonly method: string; readonly adminToken?: string; readonly body?: unknown },
): Promise<T> {
  const headers: Record<string, string> = {}
  if (input.body !== undefined) {
    headers["content-type"] = "application/json"
  }
  if (input.adminToken) {
    headers["x-admin-token"] = input.adminToken
  }

  const init: RequestInit = { method: input.method, headers }
  if (input.body !== undefined) {
    init.body = JSON.stringify(input.body)
  }

  const response = await fetch(path, init)
  const json = await response.json()
  if (!response.ok) {
    throw new Error(errorMessage(json))
  }
  return json
}

export function errorMessage(value: unknown): string {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = value.error
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      return error.message
    }
  }
  return "Request failed."
}
