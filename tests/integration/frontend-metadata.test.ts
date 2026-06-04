import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

describe("frontend metadata", () => {
  it("Given the built dashboard When metadata files are inspected Then PWA and OpenGraph assets exist", async () => {
    // Given
    const indexPath = new URL("../../apps/web/index.html", import.meta.url)
    const mainPath = new URL("../../apps/web/src/main.tsx", import.meta.url)
    const manifestPath = new URL("../../apps/web/public/manifest.webmanifest", import.meta.url)
    const serviceWorkerPath = new URL("../../apps/web/public/sw.js", import.meta.url)
    const headersPath = new URL("../../apps/web/public/_headers", import.meta.url)

    // When
    const indexHtml = await readFile(indexPath, "utf8")
    const mainTsx = await readFile(mainPath, "utf8")
    const manifest = await readFile(manifestPath, "utf8")
    const serviceWorker = await readFile(serviceWorkerPath, "utf8")
    const headers = await readFile(headersPath, "utf8")

    // Then
    expect(indexHtml).toContain('<meta property="og:title" content="Gorky"')
    expect(indexHtml).toContain('<link rel="manifest" href="/manifest.webmanifest"')
    expect(mainTsx).toContain('serviceWorker.register("/sw.js")')
    expect(manifest).toContain('"name": "Gorky"')
    expect(serviceWorker).toContain("gorky-shell")
    expect(headers).toContain("Content-Security-Policy:")
    expect(headers).toContain("worker-src 'self'")
    expect(headers).toContain("Strict-Transport-Security:")
  })
})
