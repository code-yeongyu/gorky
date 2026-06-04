import type { ApiKeyRow, CreateKeyResponse } from "./api"
import { copyTextToClipboard } from "./clipboard"
import { type FormSubmitEvent, messageFromError } from "./form-utils"

type NoticePayload = { readonly kind: "success" | "error"; readonly message: string }

export function DashboardMetrics(props: {
  readonly activeAccounts: number
  readonly knownModels: number
  readonly activeKeys: number
}): React.ReactElement {
  return (
    <section className="metrics" aria-label="Service metrics">
      <article>
        <span>Active accounts</span>
        <strong>{props.activeAccounts}</strong>
      </article>
      <article>
        <span>Known models</span>
        <strong>{props.knownModels}</strong>
      </article>
      <article>
        <span>Custom keys</span>
        <strong>{props.activeKeys}</strong>
      </article>
    </section>
  )
}

export function AdminTokenForm(props: {
  readonly adminToken: string
  readonly isBusy: boolean
  readonly onChange: (value: string) => void
  readonly onSubmit: (event: FormSubmitEvent) => void
}): React.ReactElement {
  return (
    <form className="token-form" onSubmit={props.onSubmit}>
      <label htmlFor="admin-token">Admin token</label>
      <input
        id="admin-token"
        name="adminToken"
        type="password"
        value={props.adminToken}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        autoComplete="off"
      />
      <button type="submit" disabled={!props.adminToken || props.isBusy}>
        Sync
      </button>
    </form>
  )
}

export function KeyList(props: {
  readonly apiKeys: readonly ApiKeyRow[]
  readonly isBusy: boolean
  readonly onRevoke: (keyId: string) => void
}): React.ReactElement {
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
          <div className="row-actions">
            <span className="last-used">
              {apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : "unused"}
            </span>
            <button
              type="button"
              className="button-danger"
              disabled={props.isBusy || keyStatus(apiKey) !== "active"}
              onClick={() => props.onRevoke(apiKey.id)}
            >
              Revoke
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

export function OAuthForm(props: {
  readonly models: readonly string[]
  readonly onSubmit: (event: FormSubmitEvent) => void
}): React.ReactElement {
  return (
    <form className="form-stack" onSubmit={props.onSubmit}>
      <h3>OAuth start</h3>
      <label>
        Callback URL
        <input
          name="redirectUri"
          autoComplete="off"
          placeholder="http://127.0.0.1:<port>/callback"
        />
      </label>
      <CheckboxGroup name="modelIds" models={props.models} />
      <button type="submit">Open OAuth</button>
    </form>
  )
}

export function ManualAccountForm(props: {
  readonly models: readonly string[]
  readonly onSubmit: (event: FormSubmitEvent) => void
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
  readonly onSubmit: (event: FormSubmitEvent) => void
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

export function GeneratedKeyOutput(props: {
  readonly generatedKey: CreateKeyResponse
  readonly onNotice: (notice: NoticePayload) => void
}): React.ReactElement {
  async function copyGeneratedApiKey(): Promise<void> {
    try {
      const clipboard =
        "clipboard" in globalThis.navigator ? globalThis.navigator.clipboard : undefined
      const result = await copyTextToClipboard(clipboard, props.generatedKey.plaintextKey)
      props.onNotice({
        kind: result === "copied" ? "success" : "error",
        message: result === "copied" ? "API key copied." : "Clipboard is unavailable.",
      })
    } catch (error) {
      props.onNotice({ kind: "error", message: messageFromError(error) })
    }
  }

  return (
    <output className="key-output" aria-label="Generated API key">
      <div>
        <span>{props.generatedKey.keyPrefix}</span>
        <code>{props.generatedKey.plaintextKey}</code>
      </div>
      <button type="button" onClick={copyGeneratedApiKey}>
        Copy
      </button>
    </output>
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

export function ModelChips(props: {
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
