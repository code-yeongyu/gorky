import type { FormEvent } from "react"
import type { AccountRow, ApiKeyRow } from "./api"

export function AccountList(props: {
  readonly accounts: readonly AccountRow[]
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
          <span className="last-used">
            {account.lastUsedAt ? formatDate(account.lastUsedAt) : "idle"}
          </span>
        </article>
      ))}
    </div>
  )
}

export function KeyList(props: { readonly apiKeys: readonly ApiKeyRow[] }): React.ReactElement {
  if (!props.apiKeys.length) {
    return <p className="empty-state">No keys loaded yet.</p>
  }
  return (
    <div className="key-list">
      {props.apiKeys.map((apiKey) => (
        <article className="key-row" key={apiKey.id}>
          <div>
            <span className="status" data-state={keyStatus(apiKey)}>
              {keyStatus(apiKey)}
            </span>
            <h3>{apiKey.name}</h3>
            <p>
              <code>{apiKey.keyPrefix}</code>
            </p>
          </div>
          <ModelChips models={apiKey.allowedModels} label={`${apiKey.name} allowed models`} />
          <span className="last-used">
            {apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : "unused"}
          </span>
        </article>
      ))}
    </div>
  )
}

export function OAuthForm(props: {
  readonly models: readonly string[]
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
}): React.ReactElement {
  return (
    <form className="form-stack" onSubmit={props.onSubmit}>
      <h3>OAuth start</h3>
      <label>
        Callback URL
        <input name="redirectUri" autoComplete="off" placeholder="Default callback URL" />
      </label>
      <CheckboxGroup name="modelIds" models={props.models} />
      <button type="submit">Open OAuth</button>
    </form>
  )
}

export function ManualAccountForm(props: {
  readonly models: readonly string[]
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
}): React.ReactElement {
  return (
    <form className="form-stack" onSubmit={props.onSubmit}>
      <h3>Manual token import</h3>
      <label>
        Email
        <input name="email" type="email" autoComplete="off" required />
      </label>
      <label>
        Access token
        <input name="accessToken" type="password" autoComplete="off" required />
      </label>
      <label>
        Refresh token
        <input name="refreshToken" type="password" autoComplete="off" required />
      </label>
      <label>
        Expires at
        <input
          name="expiresAt"
          type="number"
          min="1"
          defaultValue={Date.now() + 21_600_000}
          required
        />
      </label>
      <CheckboxGroup name="modelIds" models={props.models} />
      <button type="submit">Register</button>
    </form>
  )
}

export function KeyForm(props: {
  readonly models: readonly string[]
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
}): React.ReactElement {
  return (
    <form className="form-stack" onSubmit={props.onSubmit}>
      <label>
        Key name
        <input name="name" defaultValue="gorky-dashboard" required />
      </label>
      <CheckboxGroup name="allowedModels" models={props.models} />
      <button type="submit">Create key</button>
    </form>
  )
}

function CheckboxGroup(props: {
  readonly name: string
  readonly models: readonly string[]
}): React.ReactElement {
  return (
    <fieldset>
      <legend>Models</legend>
      {props.models.map((model) => (
        <label className="check" key={`${props.name}-${model}`}>
          <input name={props.name} type="checkbox" value={model} defaultChecked />
          <span>{model}</span>
        </label>
      ))}
    </fieldset>
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

function keyStatus(apiKey: ApiKeyRow): "active" | "revoked" | "disabled" {
  if (apiKey.revokedAt) {
    return "revoked"
  }
  if (apiKey.deactivatedAt) {
    return "disabled"
  }
  return "active"
}
