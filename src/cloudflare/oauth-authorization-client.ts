import ky from "ky"
import { z } from "zod"
import type { OAuthAuthorizationClient, OAuthTokenExchangeResult } from "../domain/oauth"

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  id_token: z.string().optional(),
})

const JwtPayloadSchema = z.object({
  email: z.string().optional(),
  sub: z.string().optional(),
})

export function createOAuthAuthorizationClient(config: {
  readonly issuer: string
  readonly clientId: string
}): OAuthAuthorizationClient {
  return {
    exchangeCode: async (input): Promise<OAuthTokenExchangeResult> => {
      try {
        const response = await ky
          .post(`${config.issuer}/oauth2/token`, {
            body: new URLSearchParams({
              grant_type: "authorization_code",
              client_id: config.clientId,
              code: input.code,
              code_verifier: input.codeVerifier,
              redirect_uri: input.redirectUri,
            }),
          })
          .json()
        const parsed = TokenResponseSchema.safeParse(response)
        if (!parsed.success) {
          return {
            kind: "failure",
            errorCode: "malformed_authorization_response",
            message: "Grok authorization response was malformed",
          }
        }

        return {
          kind: "success",
          accessToken: parsed.data.access_token,
          refreshToken: parsed.data.refresh_token,
          expiresInSeconds: parsed.data.expires_in,
          email: emailFromIdToken(parsed.data.id_token) ?? "unknown@gorky.local",
        }
      } catch (error) {
        if (error instanceof Error) {
          return {
            kind: "failure",
            errorCode: "authorization_request_failed",
            message: error.message,
          }
        }
        throw error
      }
    },
  }
}

function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) {
    return null
  }
  const payload = idToken.split(".")[1]
  if (!payload) {
    return null
  }
  let json: unknown
  try {
    json = JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/")))
  } catch (error) {
    if (error instanceof Error) {
      return null
    }
    throw error
  }
  const parsed = JwtPayloadSchema.safeParse(json)
  if (!parsed.success) {
    return null
  }
  return parsed.data.email ?? parsed.data.sub ?? null
}
