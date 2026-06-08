import type { Hono } from "hono"
import type { AppDependencies } from "../app"
import { logAdminEvent, redactAccount } from "./admin-presenters"
import { readJson, requireAdmin, toOpenAiError } from "./auth"
import { UpdateAccountPriorityRequestSchema, UpdateRoutingRequestSchema } from "./schemas"

export function registerAdminRoutingRoutes(app: Hono, deps: AppDependencies): void {
  app.get("/api/admin/routing", async (c) => {
    const auth = requireAdmin(c.req.raw.headers, deps.adminToken)
    if (auth) {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_auth_failed", 401)
      return auth
    }
    return c.json({ routing: await deps.store.getRoutingConfig() })
  })

  app.patch("/api/admin/routing", async (c) => {
    const auth = requireAdmin(c.req.raw.headers, deps.adminToken)
    if (auth) {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_auth_failed", 401)
      return auth
    }
    const parsed = UpdateRoutingRequestSchema.safeParse(await readJson(c.req.raw))
    if (!parsed.success) {
      return c.json(
        toOpenAiError("invalid_request_error", "invalid_json", "Invalid routing body"),
        400,
      )
    }
    await deps.store.saveRoutingConfig(parsed.data)
    logAdminEvent(deps, c.req.raw, c.req.path, "admin_routing_updated", 200, parsed.data)
    return c.json({ routing: parsed.data })
  })

  app.patch("/api/admin/accounts/:id/priority", async (c) => {
    const auth = requireAdmin(c.req.raw.headers, deps.adminToken)
    if (auth) {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_auth_failed", 401)
      return auth
    }
    const parsed = UpdateAccountPriorityRequestSchema.safeParse(await readJson(c.req.raw))
    if (!parsed.success) {
      return c.json(
        toOpenAiError("invalid_request_error", "invalid_json", "Invalid account priority body"),
        400,
      )
    }
    const account = await deps.store.updateAccountPriority(c.req.param("id"), parsed.data.priority)
    if (!account) {
      return c.json(
        toOpenAiError("invalid_request_error", "account_not_found", "Account not found"),
        404,
      )
    }
    logAdminEvent(deps, c.req.raw, c.req.path, "admin_account_priority_updated", 200, {
      accountId: account.id,
      priority: account.priority ?? 100,
    })
    return c.json({ account: redactAccount(account) })
  })
}
