import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

describe("frontend metadata", () => {
  it("Given the built dashboard When metadata files are inspected Then PWA and OpenGraph assets exist", async () => {
    // Given
    const indexPath = new URL("../../apps/web/index.html", import.meta.url)
    const manifestPath = new URL("../../apps/web/public/manifest.webmanifest", import.meta.url)
    const headersPath = new URL("../../apps/web/public/_headers", import.meta.url)

    // When
    const indexHtml = await readFile(indexPath, "utf8")
    const manifest = await readFile(manifestPath, "utf8")
    const headers = await readFile(headersPath, "utf8")

    // Then
    expect(indexHtml).toContain('<meta property="og:title" content="Gorky"')
    expect(indexHtml).toContain('<link rel="manifest" href="/manifest.webmanifest"')
    expect(manifest).toContain('"name": "Gorky"')
    expect(headers).toContain("Content-Security-Policy:")
    expect(headers).toContain("Strict-Transport-Security:")
  })
})
