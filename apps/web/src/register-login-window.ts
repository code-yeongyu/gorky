export type ReservedLoginWindow = {
  opener: unknown
  readonly location: { href: string }
  readonly close: () => void
}

export type OpenLoginWindow = (url: string, target: "_blank") => ReservedLoginWindow | null

export function reserveLoginWindow(
  openWindow: OpenLoginWindow = globalThis.open,
): ReservedLoginWindow | null {
  const loginWindow = openWindow("about:blank", "_blank")
  if (!loginWindow) return null
  loginWindow.opener = null
  return loginWindow
}

export function openReservedLoginWindow(
  loginWindow: ReservedLoginWindow | null,
  authorizationUrl: string,
): boolean {
  if (!loginWindow) return false
  loginWindow.location.href = authorizationUrl
  return true
}
