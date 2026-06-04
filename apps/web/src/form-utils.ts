export type FormSubmitEvent = Parameters<NonNullable<React.ComponentProps<"form">["onSubmit"]>>[0]

export function stringField(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === "string" ? value : ""
}

export function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error."
}
