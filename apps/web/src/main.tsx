import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./styles.css"

type AccountRow = {
  readonly id: string
  readonly email: string
  readonly status: "active" | "refresh_failed" | "disabled"
  readonly expiresAt: string
  readonly models: readonly string[]
  readonly lastUsed: string
}

const accounts: readonly AccountRow[] = [
  {
    id: "acct_primary",
    email: "q_yeon_gyu_kim@example.com",
    status: "active",
    expiresAt: "2026-06-02 21:15",
    models: ["grok-composer-2.5-fast", "grok-build"],
    lastUsed: "2 min ago",
  },
  {
    id: "acct_backup",
    email: "backup@example.com",
    status: "active",
    expiresAt: "2026-06-03 04:40",
    models: ["grok-composer-2.5-fast"],
    lastUsed: "idle",
  },
]

function App(): React.ReactElement {
  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Gorky navigation">
        <div className="brand">Gorky</div>
        <nav>
          <a href="/accounts" aria-current="page">
            Accounts
          </a>
          <a href="/keys">Keys</a>
          <a href="/usage">Usage</a>
        </nav>
      </aside>
      <section className="content" aria-labelledby="page-title">
        <header className="topbar">
          <div>
            <p className="eyebrow">Grok routing console</p>
            <h1 id="page-title">Account health and token sets</h1>
          </div>
          <button type="button">Register account</button>
        </header>
        <section className="metrics" aria-label="Service metrics">
          <article>
            <span>Active accounts</span>
            <strong>2</strong>
          </article>
          <article>
            <span>Allowed models</span>
            <strong>2</strong>
          </article>
          <article>
            <span>Refresh window</span>
            <strong>5m</strong>
          </article>
        </section>
        <section className="panel" aria-label="Registered accounts">
          <div className="panel-title">
            <h2>Registered accounts</h2>
            <p>No token material is shown in the dashboard.</p>
          </div>
          <div className="account-list">
            {accounts.map((account) => (
              <article className="account-row" key={account.id}>
                <div>
                  <span className="status" data-state={account.status}>
                    {account.status}
                  </span>
                  <h3>{account.email}</h3>
                  <p>Expires {account.expiresAt}</p>
                </div>
                <ul className="models" aria-label={`${account.email} models`}>
                  {account.models.map((model) => (
                    <li key={model}>{model}</li>
                  ))}
                </ul>
                <span className="last-used">{account.lastUsed}</span>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
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
