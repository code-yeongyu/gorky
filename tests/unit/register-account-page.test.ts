import { describe, expect, it } from "vitest"
import {
  openReservedLoginWindow,
  reserveLoginWindow,
} from "../../apps/web/src/register-login-window"

describe("register account page login window", () => {
  it("Given a user starts X login When the auth URL arrives Then the reserved tab navigates there", () => {
    // Given
    const opened = {
      opener: {},
      location: { href: "about:blank" },
      close: () => undefined,
    }
    const openedUrls: string[] = []

    // When
    const reserved = reserveLoginWindow((url, target) => {
      openedUrls.push(`${target}:${url}`)
      return opened
    })
    const didOpen = openReservedLoginWindow(
      reserved,
      "https://auth.x.ai/oauth2/authorize?state=state_1",
    )

    // Then
    expect(openedUrls).toEqual(["_blank:about:blank"])
    expect(opened.opener).toBeNull()
    expect(didOpen).toBe(true)
    expect(opened.location.href).toBe("https://auth.x.ai/oauth2/authorize?state=state_1")
  })

  it("Given the browser blocks a new tab When the auth URL arrives Then the caller can keep the current page", () => {
    // Given
    const reserved = reserveLoginWindow(() => null)

    // When
    const didOpen = openReservedLoginWindow(
      reserved,
      "https://auth.x.ai/oauth2/authorize?state=state_1",
    )

    // Then
    expect(didOpen).toBe(false)
  })
})
