import { type FormEvent, StrictMode, useEffect, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  type AccountRow,
  type CreateKeyResponse,
  fetchAccounts,
  fetchModels,
  requestJson,
} from "./api"
import { AccountList, KeyForm, ManualAccountForm, OAuthForm } from "./components"
import "./styles.css"

type Notice = { readonly kind: "success" | "error" | "info"; readonly message: string }

const ADMIN_TOKEN_STORAGE_KEY = "gorky.adminToken"

function App(): React.ReactElement {
  const [adminToken, setAdminToken] = useState(
    () => sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? "",
  )
  const [models, setModels] = useState<readonly string[]>([])
  const [accounts, setAccounts] = useState<readonly AccountRow[]>([])
  const [notice, setNotice] = useState<Notice>({
    kind: "info",
    message: "Connect with an admin token.",
  })
  const [generatedKey, setGeneratedKey] = useState<CreateKeyResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const activeAccounts = accounts.filter((account) => account.status === "active").length

  useEffect(() => {
    fetchModels()
      .then(setModels)
      .catch(() => setNotice({ kind: "error", message: "Could not load models." }))
  }, [])

  const defaultModel = models[0] ?? "grok-build"
  const modelOptions = useMemo(() => (models.length ? models : ["grok-build"]), [models])

  async function refreshAccounts(token = adminToken): Promise<void> {
    if (!token) {
      return
    }
    setIsLoading(true)
    try {
      const nextAccounts = await fetchAccounts(token)
      setAccounts(nextAccounts)
      setNotice({ kind: "success", message: "Dashboard is synced." })
    } catch (error) {
      setNotice({ kind: "error", message: messageFromError(error) })
    } finally {
      setIsLoading(false)
    }
  }

  async function saveAdminToken(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, adminToken)
    await refreshAccounts(adminToken)
  }

  async function startOAuth(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const redirectUri = stringField(form, "redirectUri")
    const selectedModels = form.getAll("modelIds").map(String)
    try {
      const response = await requestJson<{ readonly authorizationUrl: string }>(
        "/api/admin/oauth/start",
        {
          method: "POST",
          adminToken,
          body: {
            redirectUri,
            modelIds: selectedModels.length ? selectedModels : [defaultModel],
          },
        },
      )
      globalThis.location.assign(response.authorizationUrl)
    } catch (error) {
      setNotice({ kind: "error", message: messageFromError(error) })
    }
  }

  async function createKey(event: FormEvent<HTMLFormElement>): Promise<void> {
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
      setNotice({
        kind: "success",
        message: "API key created. Copy it now; it will not be shown again.",
      })
    } catch (error) {
      setNotice({ kind: "error", message: messageFromError(error) })
    }
  }

  async function registerManualAccount(event: FormEvent<HTMLFormElement>): Promise<void> {
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
      await refreshAccounts()
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
          <form className="token-form" onSubmit={saveAdminToken}>
            <label htmlFor="admin-token">Admin token</label>
            <input
              id="admin-token"
              name="adminToken"
              type="password"
              value={adminToken}
              onChange={(event) => setAdminToken(event.currentTarget.value)}
              autoComplete="off"
            />
            <button type="submit" disabled={!adminToken || isLoading}>
              Sync
            </button>
          </form>
        </header>

        <p className="notice" data-kind={notice.kind}>
          {notice.message}
        </p>

        <section className="metrics" aria-label="Service metrics">
          <article>
            <span>Active accounts</span>
            <strong>{activeAccounts}</strong>
          </article>
          <article>
            <span>Known models</span>
            <strong>{modelOptions.length}</strong>
          </article>
          <article>
            <span>Refresh window</span>
            <strong>5m</strong>
          </article>
        </section>

        <section className="dashboard-grid">
          <section className="panel" id="accounts" aria-label="Registered accounts">
            <div className="panel-title">
              <h2>Registered accounts</h2>
              <button
                type="button"
                onClick={() => refreshAccounts()}
                disabled={!adminToken || isLoading}
              >
                Refresh
              </button>
            </div>
            <AccountList accounts={accounts} />
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
              <h2>Custom API key</h2>
              <p>Keys are hash-stored and returned once.</p>
            </div>
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

function stringField(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === "string" ? value : ""
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error."
}

const root = document.getElementById("root")
if (!root) {
  throw new Error("Root element not found")
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
