import ky from "ky"
import { z } from "zod"
import type { TokenRefreshClient, TokenRefreshResult } from "../domain/types"

const RefreshResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().int().positive(),
})

export type OAuthRefreshConfig = {
  readonly issuer: string
  readonly clientId: string
}

export function createOAuthRefreshClient(config: OAuthRefreshConfig): TokenRefreshClient {
  return {
    refresh: async (refreshToken): Promise<TokenRefreshResult> => {
      try {
        const response = await ky
          .post(`${config.issuer}/oauth2/token`, {
            body: new URLSearchParams({
              grant_type: "refresh_token",
              client_id: config.clientId,
              refresh_token: refreshToken,
            }),
            timeout: 15_000,
            retry: 0,
          })
          .json()
        const parsed = RefreshResponseSchema.safeParse(response)
        if (!parsed.success) {
          return {
            kind: "failure",
            errorCode: "malformed_refresh_response",
            message: "Grok refresh response was malformed",
          }
        }
        return {
          kind: "success",
          accessToken: parsed.data.access_token,
          refreshToken: parsed.data.refresh_token ?? null,
          expiresInSeconds: parsed.data.expires_in,
        }
      } catch (error) {
        if (error instanceof Error) {
          return {
            kind: "failure",
            errorCode: "refresh_request_failed",
            message: error.message,
          }
        }
        throw error
      }
    },
  }
}
