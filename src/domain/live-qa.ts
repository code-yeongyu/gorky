import { z } from "zod"

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("gorky"),
})

export const ApiModelsResponseSchema = z.object({
  models: z.array(z.string().min(1)).min(1),
})

export const V1ModelsResponseSchema = z.object({
  object: z.literal("list"),
  data: z
    .array(
      z.object({
        id: z.string().min(1),
        object: z.literal("model"),
        created: z.number(),
        owned_by: z.string().min(1),
      }),
    )
    .min(1),
})

export const AdminProtectionResponseSchema = z.object({
  error: z.object({
    type: z.literal("authentication_error"),
    code: z.literal("invalid_admin_token"),
    message: z.string().min(1),
  }),
})

export const OAuthUnknownModelResponseSchema = z.object({
  error: z.object({
    type: z.literal("invalid_request_error"),
    code: z.literal("unknown_model"),
    message: z.string().min(1),
  }),
})

export const ManifestResponseSchema = z.object({
  name: z.literal("Gorky"),
  display: z.literal("standalone"),
  icons: z.array(z.object({ src: z.string().min(1) })).min(1),
})

export type OpenGraphMetadata = {
  readonly title: string | null
  readonly description: string | null
  readonly type: string | null
  readonly image: string | null
  readonly twitterCard: string | null
}

export type PublicAssetResponse = {
  readonly status: number
  readonly contentType: string | null
  readonly label: string
}

const REQUIRED_SECURITY_HEADERS = [
  {
    name: "content-security-policy",
    requiredValues: ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'"],
  },
  {
    name: "permissions-policy",
    requiredValues: ["camera=()", "microphone=()", "geolocation=()"],
  },
  {
    name: "referrer-policy",
    requiredValues: ["no-referrer"],
  },
  {
    name: "strict-transport-security",
    requiredValues: ["max-age=31536000", "includeSubDomains", "preload"],
  },
  {
    name: "x-content-type-options",
    requiredValues: ["nosniff"],
  },
  {
    name: "x-frame-options",
    requiredValues: ["DENY"],
  },
] as const

export function assertMatchingModelCatalog(
  apiModels: z.infer<typeof ApiModelsResponseSchema>,
  v1Models: z.infer<typeof V1ModelsResponseSchema>,
): void {
  const apiModelIds = apiModels.models.join(",")
  const v1ModelIds = v1Models.data.map((model) => model.id).join(",")
  if (apiModelIds !== v1ModelIds) {
    throw new Error(`Live model catalogs diverged: api=${apiModelIds} v1=${v1ModelIds}`)
  }
}

export function assertAdminProtectionResponse(status: number, body: unknown, label: string): void {
  if (status !== 401) {
    throw new Error(`Expected ${label} admin protection to return 401, got ${status}`)
  }
  AdminProtectionResponseSchema.parse(body)
}

export function assertOAuthUnknownModelResponse(status: number, body: unknown): void {
  if (status !== 400) {
    throw new Error(`Expected OAuth unknown-model live check to return 400, got ${status}`)
  }
  OAuthUnknownModelResponseSchema.parse(body)
}

export function assertOpenGraphMetadata(metadata: OpenGraphMetadata): void {
  const requiredEntries = [
    ["title", metadata.title],
    ["description", metadata.description],
    ["type", metadata.type],
    ["image", metadata.image],
    ["twitterCard", metadata.twitterCard],
  ] as const
  const missing = requiredEntries.filter((entry) => !entry[1]?.trim()).map((entry) => entry[0])
  if (missing.length) {
    throw new Error(`Missing OpenGraph metadata: ${missing.join(", ")}`)
  }
}

export function assertPublicAssetResponse(response: PublicAssetResponse): void {
  if (response.status !== 200) {
    throw new Error(`Expected ${response.label} asset to return 200, got ${response.status}`)
  }
  if (!response.contentType?.includes("image/")) {
    throw new Error(`Expected ${response.label} asset to be an image, got ${response.contentType}`)
  }
}

export function assertSecurityHeaders(headers: Headers, label: string): void {
  for (const header of REQUIRED_SECURITY_HEADERS) {
    const value = headers.get(header.name)
    if (!value?.trim()) {
      throw new Error(`Missing ${label} security header: ${header.name}`)
    }
    if (!header.requiredValues.every((requiredValue) => value.includes(requiredValue))) {
      throw new Error(`Weak ${label} security header: ${header.name}`)
    }
  }
}

export function assertModelCatalogContains(
  expectedModelIds: readonly string[],
  actualModelIds: readonly string[],
  actualLabel: string,
): void {
  const missing = expectedModelIds.filter((modelId) => !actualModelIds.includes(modelId))
  if (missing.length) {
    throw new Error(`${actualLabel} is missing Grok CLI model(s): ${missing.join(", ")}`)
  }
}
