import { z } from "zod"

export const ChatCompletionRequestSchema = z.looseObject({
  model: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.string().min(1),
      content: z.unknown(),
    }),
  ),
  max_tokens: z.number().int().positive().optional(),
})

export const ResponsesRequestSchema = z.looseObject({
  model: z.string().min(1),
})

export const CreateKeyRequestSchema = z.object({
  name: z.string().min(1),
  allowedModels: z.array(z.string().min(1)).min(1),
})

export const RegisterAccountRequestSchema = z.object({
  email: z.email(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().int().positive(),
  modelIds: z.array(z.string().min(1)).min(1),
})

export const OAuthStartRequestSchema = z.object({
  redirectUri: z.url().refine(
    (value) => {
      const protocol = new URL(value).protocol
      return protocol === "https:" || protocol === "http:"
    },
    { message: "Redirect URI must use HTTP or HTTPS" },
  ),
  modelIds: z.array(z.string().min(1)).min(1).optional(),
})
