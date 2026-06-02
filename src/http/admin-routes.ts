import type { Hono } from "hono"
import type { AppDependencies } from "../app"
import { createApiKey } from "../domain/api-key"
import type { AccountTokenRecord } from "../domain/types"
import { readJson, requireAdmin, toOpenAiError } from "./auth"
import { CreateKeyRequestSchema, RegisterAccountRequestSchema } from "./schemas"

export function registerAdminRoutes(app: Hono, deps: AppDependencies): void {
  app.post("/api/admin/keys", async (c) => {
    const auth = requireAdmin(c.req.raw.headers, deps.adminToken)
    if (auth) {
      return auth
    }

    const parsed = CreateKeyRequestSchema.safeParse(await readJson(c.req.raw))
    if (!parsed.success) {
      return c.json(toOpenAiError("invalid_request_error", "invalid_json", "Invalid key body"), 400)
    }

    const created = await createApiKey({
      name: parsed.data.name,
      allowedModels: parsed.data.allowedModels,
      now: deps.now(),
    })
    await deps.store.saveApiKey(created.record)

    return c.json(
      {
        id: created.record.id,
        plaintextKey: created.plaintextKey,
        keyPrefix: created.record.keyPrefix,
        name: created.record.name,
        allowedModels: created.record.allowedModels,
        createdAt: created.record.createdAt,
      },
      201,
    )
  })

  app.post("/api/admin/accounts", async (c) => {
    const auth = requireAdmin(c.req.raw.headers, deps.adminToken)
    if (auth) {
      return auth
    }

    const parsed = RegisterAccountRequestSchema.safeParse(await readJson(c.req.raw))
    if (!parsed.success) {
      return c.json(
        toOpenAiError("invalid_request_error", "invalid_json", "Invalid account body"),
        400,
      )
    }

    const account = {
      id: `acct_${crypto.randomUUID()}`,
      email: parsed.data.email,
      accessToken: parsed.data.accessToken,
      refreshToken: parsed.data.refreshToken,
      expiresAt: parsed.data.expiresAt,
      modelIds: parsed.data.modelIds,
      status: "active",
      lastUsedAt: null,
    } satisfies AccountTokenRecord
    await deps.store.saveAccount(account)

    return c.json(
      {
        id: account.id,
        email: account.email,
        principalType: "User",
        expiresAt: account.expiresAt,
        modelIds: account.modelIds,
        status: account.status,
        lastUsedAt: account.lastUsedAt,
      },
      201,
    )
  })

  app.get("/api/admin/accounts", async (c) => {
    const auth = requireAdmin(c.req.raw.headers, deps.adminToken)
    if (auth) {
      return auth
    }

    const accounts = await deps.store.listAccounts()
    return c.json({
      accounts: accounts.map((account) => ({
        id: account.id,
        email: account.email,
        principalType: account.status,
        expiresAt: account.expiresAt,
        modelIds: account.modelIds,
        status: account.status,
        lastUsedAt: account.lastUsedAt,
      })),
    })
  })
}
