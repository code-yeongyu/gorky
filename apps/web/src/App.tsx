import { useEffect, useMemo, useState } from "react"
import { AccountList } from "./account-list"
import {
  type AccountRow,
  type ApiKeyRow,
  type CreateKeyResponse,
  disableAccount,
  enableAccount,
  fetchAccounts,
  fetchKeys,
  fetchModels,
  refreshAccount,
  requestJson,
  revokeKey,
} from "./api"
import {
  AdminTokenForm,
  DashboardMetrics,
  KeyForm,
  KeyList,
  ManualAccountForm,
  OAuthForm,
} from "./components"
import { type FormSubmitEvent, messageFromError, stringField } from "./form-utils"

type Notice = { readonly kind: "success" | "error" | "info"; readonly message: string }

const ADMIN_TOKEN_STORAGE_KEY = "gorky.adminToken"

export function App(): React.ReactElement {
  const [adminToken, setAdminToken] = useState(
    () => sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? "",
  )
  const [models, setModels] = useState<readonly string[]>([])
  const [accounts, setAccounts] = useState<readonly AccountRow[]>([])
  const [apiKeys, setApiKeys] = useState<readonly ApiKeyRow[]>([])
  const [notice, setNotice] = useState<Notice>({
    kind: "info",
    message: "Connect with an admin token.",
  })
  const [generatedKey, setGeneratedKey] = useState<CreateKeyResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const activeAccounts = accounts.filter((account) => account.status === "active").length
  const activeKeys = apiKeys.filter((apiKey) => !apiKey.revokedAt && !apiKey.deactivatedAt).length

  useEffect(() => {
    fetchModels()
      .then(setModels)
      .catch(() => setNotice({ kind: "error", message: "Could not load models." }))
  }, [])

  const modelOptions = useMemo(() => (models.length ? models : ["grok-build"]), [models])

  async function refreshDashboard(token = adminToken): Promise<void> {
    if (!token) {
      return
    }
    setIsLoading(true)
    try {
      const [nextAccounts, nextKeys] = await Promise.all([fetchAccounts(token), fetchKeys(token)])
      setAccounts(nextAccounts)
      setApiKeys(nextKeys)
      setNotice({ kind: "success", message: "Dashboard is synced." })
    } catch (error) {
      setNotice({ kind: "error", message: messageFromError(error) })
    } finally {
      setIsLoading(false)
    }
  }

  async function saveAdminToken(event: FormSubmitEvent): Promise<void> {
    event.preventDefault()
    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, adminToken)
    await refreshDashboard(adminToken)
  }

  async function startOAuth(event: FormSubmitEvent): Promise<void> {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const redirectUri =
      stringField(form, "redirectUri") || `${globalThis.location.origin}/api/oauth/callback`
    const selectedModels = form.getAll("modelIds").map(String)
    try {
      const response = await requestJson<{ readonly authorizationUrl: string }>(
        "/api/admin/oauth/start",
        {
          method: "POST",
          adminToken,
          body: {
            redirectUri,
            modelIds: selectedModels.length ? selectedModels : [modelOptions[0] ?? "grok-build"],
          },
        },
      )
      globalThis.location.assign(response.authorizationUrl)
    } catch (error) {
      setNotice({ kind: "error", message: messageFromError(error) })
    }
  }

  async function createKey(event: FormSubmitEvent): Promise<void> {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      const response = await requestJson<CreateKeyResponse>("/api/admin/keys", {
        method: "POST",
        adminToken,
        body: {
          name: stringField(form, "name"),
          allowedModels: form.getAll("allowedModels").map(String),
        },
      })
      setGeneratedKey(response)
      await refreshDashboard()
      setNotice({
        kind: "success",
        message: "API key created. Copy it now; it will not be shown again.",
      })
    } catch (error) {
      setNotice({ kind: "error", message: messageFromError(error) })
    }
  }

  async function runAccountAction(action: () => Promise<unknown>, message: string): Promise<void> {
    try {
      setIsLoading(true)
      await action()
      await refreshDashboard()
      setNotice({ kind: "success", message })
    } catch (error) {
      setNotice({ kind: "error", message: messageFromError(error) })
    } finally {
      setIsLoading(false)
    }
  }

  async function setRegisteredAccountStatus(
    accountId: string,
    nextStatus: "active" | "disabled",
  ): Promise<void> {
    const action = nextStatus === "active" ? enableAccount : disableAccount
    await runAccountAction(() => action(adminToken, accountId), `Account ${nextStatus}.`)
  }

  async function refreshRegisteredAccount(accountId: string): Promise<void> {
    await runAccountAction(() => refreshAccount(adminToken, accountId), "Account refreshed.")
  }

  async function revokeApiKey(keyId: string): Promise<void> {
    try {
      setIsLoading(true)
      await revokeKey(adminToken, keyId)
      await refreshDashboard()
      setNotice({ kind: "success", message: "API key revoked." })
    } catch (error) {
      setNotice({ kind: "error", message: messageFromError(error) })
    } finally {
      setIsLoading(false)
    }
  }

  async function registerManualAccount(event: FormSubmitEvent): Promise<void> {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      await requestJson("/api/admin/accounts", {
        method: "POST",
        adminToken,
        body: {
          email: stringField(form, "email"),
          accessToken: stringField(form, "accessToken"),
          refreshToken: stringField(form, "refreshToken"),
          expiresAt: Number(stringField(form, "expiresAt")),
          modelIds: form.getAll("modelIds").map(String),
        },
      })
      formElement.reset()
      await refreshDashboard()
      setNotice({ kind: "success", message: "Account registered. Token fields were cleared." })
    } catch (error) {
      setNotice({ kind: "error", message: messageFromError(error) })
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Gorky navigation">
        <div className="brand">Gorky</div>
        <nav>
          <a href="#accounts" aria-current="page">
            Accounts
          </a>
          <a href="#keys">Keys</a>
          <a href="#register">Register</a>
        </nav>
      </aside>
      <section className="content" aria-labelledby="page-title">
        <header className="topbar">
          <div>
            <p className="eyebrow">Grok routing console</p>
            <h1 id="page-title">Account health and token sets</h1>
          </div>
          <AdminTokenForm
            adminToken={adminToken}
            isBusy={isLoading}
            onChange={setAdminToken}
            onSubmit={saveAdminToken}
          />
        </header>

        <p className="notice" data-kind={notice.kind}>
          {notice.message}
        </p>

        <DashboardMetrics
          activeAccounts={activeAccounts}
          knownModels={modelOptions.length}
          activeKeys={activeKeys}
        />

        <section className="dashboard-grid">
          <section className="panel" id="accounts" aria-label="Registered accounts">
            <div className="panel-title">
              <h2>Registered accounts</h2>
              <button
                type="button"
                onClick={() => refreshDashboard()}
                disabled={!adminToken || isLoading}
              >
                Refresh
              </button>
            </div>
            <AccountList
              accounts={accounts}
              isBusy={isLoading}
              onDisable={(accountId) => setRegisteredAccountStatus(accountId, "disabled")}
              onEnable={(accountId) => setRegisteredAccountStatus(accountId, "active")}
              onRefresh={refreshRegisteredAccount}
            />
          </section>

          <section className="panel" id="register" aria-label="Register accounts">
            <div className="panel-title">
              <h2>Register account</h2>
              <p>No token material is shown after submit.</p>
            </div>
            <OAuthForm models={modelOptions} onSubmit={startOAuth} />
            <ManualAccountForm models={modelOptions} onSubmit={registerManualAccount} />
          </section>

          <section className="panel" id="keys" aria-label="API keys">
            <div className="panel-title">
              <h2>Custom API keys</h2>
              <p>Keys are hash-stored and returned once.</p>
            </div>
            <KeyList apiKeys={apiKeys} isBusy={isLoading} onRevoke={revokeApiKey} />
            <KeyForm models={modelOptions} onSubmit={createKey} />
            {generatedKey ? (
              <output className="key-output" aria-label="Generated API key">
                <span>{generatedKey.keyPrefix}</span>
                <code>{generatedKey.plaintextKey}</code>
              </output>
            ) : null}
          </section>
        </section>
      </section>
    </main>
  )
}
