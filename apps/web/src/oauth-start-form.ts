type OAuthStartBodyResult =
  | {
      readonly kind: "success"
      readonly body: {
        readonly redirectUri: string
        readonly modelIds: readonly string[]
      }
    }
  | { readonly kind: "failure"; readonly message: string }

export function buildOAuthStartBody(
  form: FormData,
  models: readonly string[],
): OAuthStartBodyResult {
  const redirectUri = stringField(form, "redirectUri")
  if (!redirectUri) {
    return {
      kind: "failure",
      message: "OAuth start needs a Grok CLI loopback callback URL.",
    }
  }
  const selectedModels = form.getAll("modelIds").map(String)
  return {
    kind: "success",
    body: {
      redirectUri,
      modelIds: selectedModels.length ? selectedModels : [models[0] ?? "grok-composer-2.5-fast"],
    },
  }
}

function stringField(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === "string" ? value : ""
}
