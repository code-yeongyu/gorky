import { z } from "zod"

export const DEFAULT_OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "grok-cli:access",
  "api:access",
] as const

export type OAuthStateRecord = {
  readonly codeVerifier: string
  readonly redirectUri: string
  readonly nonce: string
  readonly modelIds: readonly string[]
  readonly createdAt: number
}

export type OAuthStateStore = {
  readonly put: (state: string, record: OAuthStateRecord, ttlSeconds: number) => Promise<void>
  readonly get: (state: string) => Promise<OAuthStateRecord | null>
  readonly delete: (state: string) => Promise<void>
}

export type OAuthTokenExchangeResult =
  | {
      readonly kind: "success"
      readonly accessToken: string
      readonly refreshToken: string
      readonly expiresInSeconds: number
      readonly email: string
    }
  | {
      readonly kind: "failure"
      readonly errorCode: string
      readonly message: string
    }

export type OAuthAuthorizationClient = {
  readonly exchangeCode: (input: {
    readonly code: string
    readonly codeVerifier: string
    readonly redirectUri: string
  }) => Promise<OAuthTokenExchangeResult>
}

export const OAuthStateRecordSchema = z.object({
  codeVerifier: z.string().min(32),
  redirectUri: z.url(),
  nonce: z.string().min(16),
  modelIds: z.array(z.string().min(1)).min(1),
  createdAt: z.number().int().positive(),
})

export async function createAuthorizationStart(input: {
  readonly issuer: string
  readonly clientId: string
  readonly redirectUri: string
  readonly modelIds: readonly string[]
  readonly now: number
}): Promise<{
  readonly authorizationUrl: string
  readonly state: string
  readonly stateRecord: OAuthStateRecord
}> {
  const state = randomUrlSafeToken(24)
  const nonce = randomUrlSafeToken(24)
  const codeVerifier = randomUrlSafeToken(64)
  const codeChallenge = await sha256Base64Url(codeVerifier)
  const authorizationUrl = new URL(`${input.issuer}/oauth2/authorize`)
  authorizationUrl.searchParams.set("response_type", "code")
  authorizationUrl.searchParams.set("client_id", input.clientId)
  authorizationUrl.searchParams.set("redirect_uri", input.redirectUri)
  authorizationUrl.searchParams.set("scope", DEFAULT_OAUTH_SCOPES.join(" "))
  authorizationUrl.searchParams.set("code_challenge", codeChallenge)
  authorizationUrl.searchParams.set("code_challenge_method", "S256")
  authorizationUrl.searchParams.set("state", state)
  authorizationUrl.searchParams.set("nonce", nonce)
  authorizationUrl.searchParams.set("referrer", "grok-build")

  return {
    authorizationUrl: authorizationUrl.toString(),
    state,
    stateRecord: {
      codeVerifier,
      redirectUri: input.redirectUri,
      nonce,
      modelIds: input.modelIds,
      createdAt: input.now,
    },
  }
}

function randomUrlSafeToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return base64UrlEncode(new Uint8Array(digest))
}

function base64UrlEncode(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}
