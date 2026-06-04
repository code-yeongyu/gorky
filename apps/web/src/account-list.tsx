import type { AccountRow } from "./api"

export function AccountList(props: {
  readonly accounts: readonly AccountRow[]
  readonly isBusy: boolean
  readonly onDisable: (accountId: string) => void
  readonly onEnable: (accountId: string) => void
}): React.ReactElement {
  if (!props.accounts.length) {
    return <p className="empty-state">No accounts loaded yet.</p>
  }
  return (
    <div className="account-list">
      {props.accounts.map((account) => (
        <article className="account-row" key={account.id}>
          <div>
            <span className="status" data-state={account.status}>
              {account.status}
            </span>
            <h3>{account.email}</h3>
            <p>Expires {formatDate(account.expiresAt)}</p>
          </div>
          <ModelChips models={account.modelIds} label={`${account.email} models`} />
          <div className="row-actions">
            <span className="last-used">
              {account.lastUsedAt ? formatDate(account.lastUsedAt) : "idle"}
            </span>
            <button
              type="button"
              className={account.status === "disabled" ? undefined : "button-danger"}
              disabled={props.isBusy || !["active", "disabled"].includes(account.status)}
              onClick={() =>
                account.status === "disabled"
                  ? props.onEnable(account.id)
                  : props.onDisable(account.id)
              }
            >
              {account.status === "disabled" ? "Enable" : "Disable"}
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

function ModelChips(props: {
  readonly models: readonly string[]
  readonly label: string
}): React.ReactElement {
  return (
    <ul className="models" aria-label={props.label}>
      {props.models.map((model) => (
        <li key={model}>{model}</li>
      ))}
    </ul>
  )
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  )
}
