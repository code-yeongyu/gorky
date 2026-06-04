import { z } from "zod"

const NonEmptyTrimmedStringSchema = z.string().trim().min(1)

const ModelIdSetSchema = z
  .array(NonEmptyTrimmedStringSchema)
  .min(1)
  .transform((modelIds) => [...new Set(modelIds)])

export const ChatCompletionRequestSchema = z.looseObject({
  model: NonEmptyTrimmedStringSchema,
  messages: z.array(
    z.object({
      role: z.string().min(1),
      content: z.unknown(),
    }),
  ),
  max_tokens: z.number().int().positive().optional(),
})

export const ResponsesRequestSchema = z.looseObject({
  model: NonEmptyTrimmedStringSchema,
})

export const CreateKeyRequestSchema = z.object({
  name: NonEmptyTrimmedStringSchema,
  allowedModels: ModelIdSetSchema,
})

export const RegisterAccountRequestSchema = z.object({
  email: NonEmptyTrimmedStringSchema.pipe(z.email()),
  accessToken: NonEmptyTrimmedStringSchema,
  refreshToken: NonEmptyTrimmedStringSchema,
  expiresAt: z.number().int().positive(),
  modelIds: ModelIdSetSchema,
})

export const BulkRegisterAccountsRequestSchema = z.object({
  accounts: z.array(RegisterAccountRequestSchema).min(1).max(25),
})

export const OAuthStartRequestSchema = z.object({
  redirectUri: z.url().refine(
    (value) => {
      const protocol = new URL(value).protocol
      return protocol === "https:" || protocol === "http:"
    },
    { message: "Redirect URI must use HTTP or HTTPS" },
  ),
  modelIds: ModelIdSetSchema.optional(),
})
