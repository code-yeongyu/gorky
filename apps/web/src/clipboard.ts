export type ClipboardTarget = {
  readonly writeText: (value: string) => Promise<void>
}

export type ClipboardCopyResult = "copied" | "unsupported"

export async function copyTextToClipboard(
  clipboard: ClipboardTarget | undefined,
  value: string,
): Promise<ClipboardCopyResult> {
  if (!clipboard) {
    return "unsupported"
  }

  await clipboard.writeText(value)
  return "copied"
}
