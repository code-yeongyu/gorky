import { useEffect, useMemo, useState } from "react"
import {
  fetchModels,
  type RegisterOAuthStartResponse,
  startRegisterOAuth,
  submitRegisterOAuthCallback,
} from "./api"
import { type FormSubmitEvent, messageFromError, stringField } from "./form-utils"
import { openReservedLoginWindow, reserveLoginWindow } from "./register-login-window"

type Notice = { readonly kind: "success" | "error" | "info"; readonly message: string }

export function RegisterAccountPage(): React.ReactElement {
  const [models, setModels] = useState<readonly string[]>([])
  const [start, setStart] = useState<RegisterOAuthStartResponse | null>(null)
  const [notice, setNotice] = useState<Notice>({
    kind: "info",
    message: "Start the X login, then submit the localhost callback URL.",
  })
  const [isBusy, setIsBusy] = useState(false)
  const selectedModels = useMemo(
    () => (models.length ? models : ["grok-composer-2.5-fast", "grok-build"]),
    [models],
  )

  useEffect(() => {
    fetchModels()
      .then(setModels)
      .catch(() => setNotice({ kind: "error", message: "Could not load model list." }))
  }, [])

  async function startLogin(event: FormSubmitEvent): Promise<void> {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const modelIds = form.getAll("modelIds").map(String)
    const loginWindow = reserveLoginWindow()
    setIsBusy(true)
    try {
      const response = await startRegisterOAuth({
        modelIds: modelIds.length ? modelIds : selectedModels,
      })
      setStart(response)
      const opened = openReservedLoginWindow(loginWindow, response.authorizationUrl)
      setNotice({
        kind: "success",
        message: opened ? "Login opened in a new tab." : "Login link is ready.",
      })
    } catch (error) {
      loginWindow?.close()
      setNotice({ kind: "error", message: messageFromError(error) })
    } finally {
      setIsBusy(false)
    }
  }

  async function submitCallback(event: FormSubmitEvent): Promise<void> {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setIsBusy(true)
    try {
      const account = await submitRegisterOAuthCallback({
        callbackUrl: stringField(form, "callbackUrl"),
      })
      setNotice({ kind: "success", message: `${account.email} registered.` })
      event.currentTarget.reset()
    } catch (error) {
      setNotice({ kind: "error", message: messageFromError(error) })
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className="register-shell">
      <section className="register-content" aria-labelledby="register-title">
        <header className="register-header">
          <p className="eyebrow">Gorky registration</p>
          <h1 id="register-title">Connect an X account</h1>
        </header>

        <p className="notice" data-kind={notice.kind}>
          {notice.message}
        </p>

        <section className="register-grid">
          <form className="panel form-stack register-panel" onSubmit={startLogin}>
            <div className="panel-title">
              <h2>Login page</h2>
              <p>Opens x.ai OAuth.</p>
            </div>
            <fieldset>
              <legend>Models</legend>
              {selectedModels.map((model) => (
                <label className="check" key={model}>
                  <input name="modelIds" type="checkbox" value={model} defaultChecked />
                  <span>{model}</span>
                </label>
              ))}
            </fieldset>
            <button type="submit" disabled={isBusy}>
              Open login
            </button>
            {start ? (
              <output className="register-output" aria-label="OAuth login details">
                <span>Login URL</span>
                <a href={start.authorizationUrl} target="_blank" rel="noreferrer">
                  Open login
                </a>
                <span>Redirect URI</span>
                <code>{start.redirectUri}</code>
              </output>
            ) : null}
          </form>

          <form className="panel form-stack register-panel" onSubmit={submitCallback}>
            <div className="panel-title">
              <h2>Callback URL</h2>
              <p>Submit the localhost redirect.</p>
            </div>
            <label>
              Localhost callback URL
              <textarea
                name="callbackUrl"
                required
                spellCheck={false}
                placeholder="http://127.0.0.1:8787/callback?code=...&state=..."
              />
            </label>
            <button type="submit" disabled={isBusy}>
              Register account
            </button>
          </form>
        </section>
      </section>
    </main>
  )
}
