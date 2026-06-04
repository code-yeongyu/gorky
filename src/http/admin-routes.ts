import type { Hono } from "hono"
import type { AppDependencies } from "../app"
import { ensureFreshAccountToken } from "../domain/account-refresh"
import { createRegisteredAccount, saveRegisteredAccounts } from "./admin-account-registration"
import {
  disableRegisteredAccount,
  enableRegisteredAccount,
  findRegisteredAccount,
  listRegisteredAccounts,
} from "./admin-account-store"
import { registerAdminBulkAccountRoutes } from "./admin-bulk-account-routes"
import { registerAdminKeyRoutes } from "./admin-key-routes"
import { logAdminEvent, redactAccount } from "./admin-presenters"
import { readJson, requireAdmin, toOpenAiError } from "./auth"
import { validateConfiguredModels } from "./model-validation"
import { RegisterAccountRequestSchema } from "./schemas"

export function registerAdminRoutes(app: Hono, deps: AppDependencies): void {
  registerAdminBulkAccountRoutes(app, deps)
  registerAdminKeyRoutes(app, deps)

  app.post("/api/admin/accounts", async (c) => {
    const auth = requireAdmin(c.req.raw.headers, deps.adminToken)
    if (auth) {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_auth_failed", 401)
      return auth
    }

    const parsed = RegisterAccountRequestSchema.safeParse(await readJson(c.req.raw))
    if (!parsed.success) {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_account_register_failed", 400, {
        errorCode: "invalid_json",
      })
      return c.json(
        toOpenAiError("invalid_request_error", "invalid_json", "Invalid account body"),
        400,
      )
    }
    const modelValidation = validateConfiguredModels(deps, parsed.data.modelIds)
    if (modelValidation.kind === "failure") {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_account_register_failed", 400, {
        errorCode: modelValidation.error.code,
        unknownModelIds: modelValidation.unknownModelIds,
      })
      return c.json({ error: modelValidation.error }, 400)
    }

    const account = createRegisteredAccount(parsed.data)
    const saved = await saveRegisteredAccounts(deps, [account])
    if (saved.kind === "failure") {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_account_register_failed", 502, {
        errorCode: saved.error.code,
      })
      return c.json({ error: saved.error }, 502)
    }

    logAdminEvent(deps, c.req.raw, c.req.path, "admin_account_registered", 201, {
      accountId: account.id,
      modelIds: account.modelIds,
      status: account.status,
    })

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
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_auth_failed", 401)
      return auth
    }

    const accounts = await listRegisteredAccounts(deps)
    if (accounts.kind === "failure") {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_accounts_list_failed", 502, {
        errorCode: accounts.error.code,
      })
      return c.json({ error: accounts.error }, 502)
    }
    logAdminEvent(deps, c.req.raw, c.req.path, "admin_accounts_listed", 200, {
      count: accounts.accounts.length,
      statuses: accounts.accounts.map((account) => account.status),
    })
    return c.json({
      accounts: accounts.accounts.map(redactAccount),
    })
  })

  app.post("/api/admin/accounts/:id/disable", async (c) => {
    const auth = requireAdmin(c.req.raw.headers, deps.adminToken)
    if (auth) {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_auth_failed", 401)
      return auth
    }

    const account = await disableRegisteredAccount(deps, c.req.param("id"))
    if (account.kind === "failure") {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_account_disable_failed", 502, {
        errorCode: account.error.code,
      })
      return c.json({ error: account.error }, 502)
    }
    if (!account.account) {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_account_disable_failed", 404, {
        errorCode: "account_not_found",
      })
      return c.json(
        toOpenAiError("invalid_request_error", "account_not_found", "Account not found"),
        404,
      )
    }

    logAdminEvent(deps, c.req.raw, c.req.path, "admin_account_disabled", 200, {
      accountId: account.account.id,
      modelIds: account.account.modelIds,
      status: account.account.status,
    })
    return c.json({ account: redactAccount(account.account) })
  })

  app.post("/api/admin/accounts/:id/enable", async (c) => {
    const auth = requireAdmin(c.req.raw.headers, deps.adminToken)
    if (auth) {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_auth_failed", 401)
      return auth
    }

    const account = await enableRegisteredAccount(deps, c.req.param("id"))
    if (account.kind === "failure") {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_account_enable_failed", 502, {
        errorCode: account.error.code,
      })
      return c.json({ error: account.error }, 502)
    }
    if (!account.account) {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_account_enable_failed", 404, {
        errorCode: "account_not_found",
      })
      return c.json(
        toOpenAiError("invalid_request_error", "account_not_found", "Account not found"),
        404,
      )
    }

    logAdminEvent(deps, c.req.raw, c.req.path, "admin_account_enabled", 200, {
      accountId: account.account.id,
      modelIds: account.account.modelIds,
      status: account.account.status,
    })
    return c.json({ account: redactAccount(account.account) })
  })

  app.post("/api/admin/accounts/:id/refresh", async (c) => {
    const auth = requireAdmin(c.req.raw.headers, deps.adminToken)
    if (auth) {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_auth_failed", 401)
      return auth
    }

    const account = await findRegisteredAccount(deps, c.req.param("id"))
    if (account.kind === "failure") {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_account_refresh_failed", 502, {
        errorCode: account.error.code,
      })
      return c.json({ error: account.error }, 502)
    }
    if (!account.account) {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_account_refresh_failed", 404, {
        errorCode: "account_not_found",
      })
      return c.json(
        toOpenAiError("invalid_request_error", "account_not_found", "Account not found"),
        404,
      )
    }

    const result = await ensureFreshAccountToken({
      account: account.account,
      client: { refresh: deps.refreshClient },
      force: true,
      now: deps.now(),
      store: deps.store,
    })
    if (result.kind === "failure") {
      logAdminEvent(deps, c.req.raw, c.req.path, "admin_account_refresh_failed", 502, {
        accountId: result.account.id,
        errorCode: result.error.code,
        status: result.account.status,
      })
      return c.json(toOpenAiError(result.error.type, result.error.code, result.error.message), 502)
    }

    logAdminEvent(deps, c.req.raw, c.req.path, "admin_account_refreshed", 200, {
      accountId: result.account.id,
      modelIds: result.account.modelIds,
      status: result.account.status,
    })
    return c.json({ account: redactAccount(result.account) })
  })
}
