export type AccountStatus = "active" | "refresh_failed" | "disabled"
export type RoutingMode = "round_robin" | "priority"

export type RoutingConfig = {
  readonly mode: RoutingMode
}

export type AccountTokenRecord = {
  readonly id: string
  readonly email: string
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresAt: number
  readonly modelIds: readonly string[]
  readonly status: AccountStatus
  readonly lastUsedAt: number | null
  readonly priority?: number | undefined
}

export type ApiKeyRecord = {
  readonly id: string
  readonly keyHash: string
  readonly keyPrefix: string
  readonly name: string
  readonly allowedModels: readonly string[]
  readonly createdAt: number
  readonly lastUsedAt: number | null
  readonly revokedAt: number | null
  readonly deactivatedAt: number | null
}

export type ApiError = {
  readonly type: string
  readonly code: string
  readonly message: string
}

export type TokenRefreshResult =
  | {
      readonly kind: "success"
      readonly accessToken: string
      readonly refreshToken: string | null
      readonly expiresInSeconds: number
    }
  | {
      readonly kind: "failure"
      readonly errorCode: string
      readonly message: string
    }

export type TokenRefreshClient = {
  readonly refresh: (refreshToken: string) => Promise<TokenRefreshResult>
}

export type TokenStore = {
  readonly saveRefreshedAccount: (account: AccountTokenRecord) => void | Promise<void>
}

export type FreshAccountResult =
  | { readonly kind: "success"; readonly account: AccountTokenRecord }
  | { readonly kind: "failure"; readonly error: ApiError; readonly account: AccountTokenRecord }

export type ApiKeyVerificationResult =
  | { readonly kind: "success"; readonly record: ApiKeyRecord }
  | { readonly kind: "failure"; readonly error: ApiError }
