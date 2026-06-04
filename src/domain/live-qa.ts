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
