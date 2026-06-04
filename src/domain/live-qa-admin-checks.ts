type OAuthUnknownModelLiveCheckBody = {
  readonly redirectUri: string
  readonly modelIds: readonly ["grok-live-qa-missing"]
}

type BulkUnknownModelLiveCheckBody = {
  readonly accounts: readonly [
    {
      readonly email: "live-qa-bulk@example.com"
      readonly accessToken: "LIVE_QA_ACCESS_SHOULD_NOT_STORE"
      readonly refreshToken: "LIVE_QA_REFRESH_SHOULD_NOT_STORE"
      readonly expiresAt: 1_780_000_000_000
      readonly modelIds: readonly ["grok-live-qa-bulk-missing"]
    },
  ]
}

export type AdminUnknownModelLiveCheck = {
  readonly label: string
  readonly url: URL
  readonly body: OAuthUnknownModelLiveCheckBody | BulkUnknownModelLiveCheckBody
}

export function buildAdminUnknownModelLiveChecks(
  baseUrl: URL,
): readonly AdminUnknownModelLiveCheck[] {
  return [
    {
      label: "OAuth",
      url: new URL("/api/admin/oauth/start", baseUrl),
      body: {
        redirectUri: new URL("/api/oauth/callback", baseUrl).href,
        modelIds: ["grok-live-qa-missing"],
      },
    },
    {
      label: "Bulk account registration",
      url: new URL("/api/admin/accounts/bulk", baseUrl),
      body: {
        accounts: [
          {
            email: "live-qa-bulk@example.com",
            accessToken: "LIVE_QA_ACCESS_SHOULD_NOT_STORE",
            refreshToken: "LIVE_QA_REFRESH_SHOULD_NOT_STORE",
            expiresAt: 1_780_000_000_000,
            modelIds: ["grok-live-qa-bulk-missing"],
          },
        ],
      },
    },
  ]
}
