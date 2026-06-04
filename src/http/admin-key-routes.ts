import type { Hono } from "hono"
import type { AppDependencies } from "../app"
import { createApiKey } from "../domain/api-key"
import {
  listRegisteredApiKeys,
  revokeRegisteredApiKey,
  saveRegisteredApiKey,
} from "./admin-key-registration"
import { logAdminEvent, redactApiKey } from "./admin-presenters"
import { readJson, requireAdmin, toOpenAiError } from "./auth"
import { validateConfiguredModels } from "./model-validation"
import { CreateKeyRequestSchema } from "./schemas"

export function registerAdminKeyRoutes(app: Hono, deps: AppDependencies): void {
  app.get("/api/admin/keys", async (c) => {
    const auth = requireAdmin(c.req.raw.headers, deps.adminToken)
    if (auth) {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_auth_failed", 401)
      return auth
    }

    const keys = await listRegisteredApiKeys(deps)
    if (keys.kind === "failure") {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_keys_list_failed", 502, {
        errorCode: keys.error.code,
      })
      return c.json({ error: keys.error }, 502)
    }

    logAdminEvent(deps, c.req.raw, c.req.path, "admin_keys_listed", 200, {
      count: keys.records.length,
      keyPrefixes: keys.records.map((key) => key.keyPrefix),
    })
    return c.json({
      keys: keys.records.map(redactApiKey),
    })
  })

  app.post("/api/admin/keys", async (c) => {
    const auth = requireAdmin(c.req.raw.headers, deps.adminToken)
    if (auth) {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_auth_failed", 401)
      return auth
    }

    const parsed = CreateKeyRequestSchema.safeParse(await readJson(c.req.raw))
    if (!parsed.success) {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_key_create_failed", 400, {
        errorCode: "invalid_json",
      })
      return c.json(toOpenAiError("invalid_request_error", "invalid_json", "Invalid key body"), 400)
    }
    const modelValidation = validateConfiguredModels(deps, parsed.data.allowedModels)
    if (modelValidation.kind === "failure") {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_key_create_failed", 400, {
        errorCode: modelValidation.error.code,
        unknownModelIds: modelValidation.unknownModelIds,
      })
      return c.json({ error: modelValidation.error }, 400)
    }

    const created = await createApiKey({
      name: parsed.data.name,
      allowedModels: parsed.data.allowedModels,
      now: deps.now(),
    })
    const saved = await saveRegisteredApiKey(deps, created.record)
    if (saved.kind === "failure") {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_key_create_failed", 502, {
        errorCode: saved.error.code,
        keyPrefix: created.record.keyPrefix,
      })
      return c.json({ error: saved.error }, 502)
    }

    logAdminEvent(deps, c.req.raw, c.req.path, "admin_key_created", 201, {
      keyPrefix: created.record.keyPrefix,
      allowedModels: created.record.allowedModels,
    })

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

  app.post("/api/admin/keys/:id/revoke", async (c) => {
    const auth = requireAdmin(c.req.raw.headers, deps.adminToken)
    if (auth) {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_auth_failed", 401)
      return auth
    }

    const key = await revokeRegisteredApiKey(deps, c.req.param("id"))
    if (key.kind === "failure") {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_key_revoke_failed", 502, {
        errorCode: key.error.code,
      })
      return c.json({ error: key.error }, 502)
    }
    if (!key.record) {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_key_revoke_failed", 404, {
        errorCode: "key_not_found",
      })
      return c.json(toOpenAiError("invalid_request_error", "key_not_found", "Key not found"), 404)
    }

    logAdminEvent(deps, c.req.raw, c.req.path, "admin_key_revoked", 200, {
      keyPrefix: key.record.keyPrefix,
      revokedAt: key.record.revokedAt,
    })
    return c.json({ key: redactApiKey(key.record) })
  })
}
