import { type ManualAccountInput, registerAccounts, requestJson } from "./api"
import { parseManualAccountBatch } from "./bulk-account-import"
import { ManualAccountForm, OAuthForm } from "./components"
import { type FormSubmitEvent, messageFromError, stringField } from "./form-utils"
import { buildOAuthStartBody } from "./oauth-start-form"
import { openReservedLoginWindow, reserveLoginWindow } from "./register-login-window"

type Notice = { readonly kind: "success" | "error" | "info"; readonly message: string }

export function RegistrationPanel(props: {
  readonly adminToken: string
  readonly models: readonly string[]
  readonly onNotice: (notice: Notice) => void
  readonly onRefreshDashboard: () => Promise<void>
}): React.ReactElement {
  async function startOAuth(event: FormSubmitEvent): Promise<void> {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const startBody = buildOAuthStartBody(form, props.models)
    if (startBody.kind === "failure") {
      props.onNotice({ kind: "error", message: startBody.message })
      return
    }
    const loginWindow = reserveLoginWindow()
    try {
      const response = await requestJson<{ readonly authorizationUrl: string }>(
        "/api/admin/oauth/start",
        {
          method: "POST",
          adminToken: props.adminToken,
          body: startBody.body,
        },
      )
      const opened = openReservedLoginWindow(loginWindow, response.authorizationUrl)
      props.onNotice({
        kind: "success",
        message: opened ? "Login opened in a new tab." : "Login link is ready.",
      })
    } catch (error) {
      loginWindow?.close()
      props.onNotice({ kind: "error", message: messageFromError(error) })
    }
  }

  async function registerManualAccount(event: FormSubmitEvent): Promise<void> {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const accounts = [
      {
        email: stringField(form, "email"),
        accessToken: stringField(form, "accessToken"),
        refreshToken: stringField(form, "refreshToken"),
        expiresAt: Number(stringField(form, "expiresAt")),
        modelIds: form.getAll("modelIds").map(String),
      },
    ]
    await submitAccounts(accounts, formElement, "Account registered. Token fields were cleared.")
  }

  async function registerBatchAccounts(event: FormSubmitEvent): Promise<void> {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const parsed = parseManualAccountBatch(stringField(form, "accounts"))
    if (parsed.kind === "failure") {
      props.onNotice({ kind: "error", message: parsed.message })
      return
    }
    await submitAccounts(
      parsed.accounts,
      formElement,
      `${parsed.accounts.length} accounts registered. Token fields were cleared.`,
    )
  }

  async function submitAccounts(
    accounts: readonly ManualAccountInput[],
    formElement: HTMLFormElement,
    message: string,
  ): Promise<void> {
    try {
      await registerAccounts(props.adminToken, accounts)
      formElement.reset()
      await props.onRefreshDashboard()
      props.onNotice({ kind: "success", message })
    } catch (error) {
      props.onNotice({ kind: "error", message: messageFromError(error) })
    }
  }

  return (
    <section className="panel" id="register" aria-label="Register accounts">
      <div className="panel-title">
        <h2>Register account</h2>
        <p>No token material is shown after submit.</p>
      </div>
      <OAuthForm models={props.models} onSubmit={startOAuth} />
      <ManualAccountForm models={props.models} onSubmit={registerManualAccount} />
      <BatchAccountForm onSubmit={registerBatchAccounts} />
    </section>
  )
}

function BatchAccountForm(props: {
  readonly onSubmit: (event: FormSubmitEvent) => void
}): React.ReactElement {
  return (
    <form className="form-stack" onSubmit={props.onSubmit}>
      <h3>Batch token import</h3>
      <label>
        Accounts JSON
        <textarea name="accounts" required spellCheck={false} />
      </label>
      <button type="submit">Register batch</button>
    </form>
  )
}
