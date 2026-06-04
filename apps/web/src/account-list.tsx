import type { AccountRow } from "./api"

export function AccountList(props: {
  readonly accounts: readonly AccountRow[]
  readonly isBusy: boolean
  readonly onDisable: (accountId: string) => void
  readonly onEnable: (accountId: string) => void
  readonly onRefresh: (accountId: string) => void
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
            <AccountActions
              account={account}
              isBusy={props.isBusy}
              onDisable={props.onDisable}
              onEnable={props.onEnable}
              onRefresh={props.onRefresh}
            />
          </div>
        </article>
      ))}
    </div>
  )
}

function AccountActions(props: {
  readonly account: AccountRow
  readonly isBusy: boolean
  readonly onDisable: (accountId: string) => void
  readonly onEnable: (accountId: string) => void
  readonly onRefresh: (accountId: string) => void
}): React.ReactElement {
  if (props.account.status === "disabled") {
    return (
      <button
        type="button"
        disabled={props.isBusy}
        onClick={() => props.onEnable(props.account.id)}
      >
        Enable
      </button>
    )
  }

  return (
    <div className="action-pair">
      <button
        type="button"
        disabled={props.isBusy}
        onClick={() => props.onRefresh(props.account.id)}
      >
        Refresh
      </button>
      <button
        type="button"
        className="button-danger"
        disabled={props.isBusy}
        onClick={() => props.onDisable(props.account.id)}
      >
        Disable
      </button>
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
