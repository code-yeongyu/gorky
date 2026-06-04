import { describe, expect, it } from "vitest"
import { copyTextToClipboard } from "../../apps/web/src/clipboard"

describe("copyTextToClipboard", () => {
  it("Given clipboard support When copying generated key Then the key is written once", async () => {
    // Given
    const writes: string[] = []
    const clipboard = {
      writeText: async (value: string): Promise<void> => {
        writes.push(value)
      },
    }

    // When
    const result = await copyTextToClipboard(clipboard, "gorky_secret_plaintext")

    // Then
    expect(result).toBe("copied")
    expect(writes).toEqual(["gorky_secret_plaintext"])
  })

  it("Given missing clipboard support When copying generated key Then unsupported is returned", async () => {
    // Given
    const clipboard = undefined

    // When
    const result = await copyTextToClipboard(clipboard, "gorky_secret_plaintext")

    // Then
    expect(result).toBe("unsupported")
  })
})
