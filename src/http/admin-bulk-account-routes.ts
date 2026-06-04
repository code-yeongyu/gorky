import type { Hono } from "hono"
import type { AppDependencies } from "../app"
import { createRegisteredAccount, saveRegisteredAccounts } from "./admin-account-registration"
import { logAdminEvent, redactAccount } from "./admin-presenters"
import { readJson, requireAdmin, toOpenAiError } from "./auth"
import { validateConfiguredModels } from "./model-validation"
import { BulkRegisterAccountsRequestSchema } from "./schemas"

export function registerAdminBulkAccountRoutes(app: Hono, deps: AppDependencies): void {
  app.post("/api/admin/accounts/bulk", async (c) => {
    const auth = requireAdmin(c.req.raw.headers, deps.adminToken)
    if (auth) {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_auth_failed", 401)
      return auth
    }

    const parsed = BulkRegisterAccountsRequestSchema.safeParse(await readJson(c.req.raw))
    if (!parsed.success) {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_accounts_register_failed", 400, {
        errorCode: "invalid_json",
      })
      return c.json(
        toOpenAiError("invalid_request_error", "invalid_json", "Invalid accounts body"),
        400,
      )
    }

    const requestedModelIds = parsed.data.accounts.flatMap((account) => account.modelIds)
    const modelValidation = validateConfiguredModels(deps, requestedModelIds)
    if (modelValidation.kind === "failure") {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_accounts_register_failed", 400, {
        errorCode: modelValidation.error.code,
        unknownModelIds: modelValidation.unknownModelIds,
      })
      return c.json({ error: modelValidation.error }, 400)
    }

    const accounts = parsed.data.accounts.map(createRegisteredAccount)
    const saved = await saveRegisteredAccounts(deps, accounts)
    if (saved.kind === "failure") {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_accounts_register_failed", 502, {
        errorCode: saved.error.code,
        count: accounts.length,
      })
      return c.json({ error: saved.error }, 502)
    }

    logAdminEvent(deps, c.req.raw, c.req.path, "admin_accounts_registered", 201, {
      accountIds: saved.accounts.map((account) => account.id),
      count: saved.accounts.length,
      modelIds: saved.accounts.flatMap((account) => account.modelIds),
    })
    return c.json({ accounts: saved.accounts.map(redactAccount) }, 201)
  })
}
