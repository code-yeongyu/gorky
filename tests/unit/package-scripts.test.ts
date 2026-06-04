import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import { z } from "zod"

const PackageJsonSchema = z.object({
  scripts: z.object({ typecheck: z.string() }).catchall(z.string()),
})

async function readPackageJson(path: string): Promise<z.infer<typeof PackageJsonSchema>> {
  return PackageJsonSchema.parse(JSON.parse(await readFile(path, "utf8")))
}

describe("package scripts", () => {
  it("Given strict TypeScript gates When running root typecheck Then web TSX is included", async () => {
    // Given
    const rootPackage = await readPackageJson("package.json")
    const webPackage = await readPackageJson("apps/web/package.json")

    // When
    const rootTypecheck = rootPackage.scripts.typecheck
    const webTypecheck = webPackage.scripts.typecheck

    // Then
    expect(rootTypecheck).toContain("pnpm --filter @gorky/web typecheck")
    expect(webTypecheck).toBe("tsc --project tsconfig.json --noEmit")
  })

  it("Given Grok model scripts When inspecting source Then sync and QA share binary resolution", async () => {
    // Given
    const syncScript = await readFile("scripts/sync-grok-models.ts", "utf8")
    const qaScript = await readFile("scripts/qa-grok-models.ts", "utf8")

    // When / Then
    expect(syncScript).toContain("resolveGrokBinaryPath")
    expect(syncScript).toContain("COMMON_LOCAL_GROK_BIN_PATH")
    expect(syncScript).toContain("buildEmptyGrokModelsDiagnostic")
    expect(qaScript).toContain("resolveGrokBinaryPath")
    expect(qaScript).toContain("COMMON_LOCAL_GROK_BIN_PATH")
    expect(qaScript).toContain("buildEmptyGrokModelsDiagnostic")
  })

  it("Given Grok model commands When reading README Then default commands use automatic binary discovery", async () => {
    // Given
    const readme = await readFile("README.md", "utf8")

    // When / Then
    expect(readme).toContain("pnpm models:sync\npnpm exec wrangler deploy")
    expect(readme).toContain("pnpm qa:grok-models")
    expect(readme).not.toContain("GORKY_GROK_BIN=/Users/yeongyu/.grok/bin/grok pnpm models:sync")
    expect(readme).not.toContain("GORKY_GROK_BIN=/Users/yeongyu/.grok/bin/grok pnpm qa:grok-models")
  })

  it("Given bulk account registration exists When inspecting docs and live QA Then the admin route is covered", async () => {
    // Given
    const readme = await readFile("README.md", "utf8")
    const liveQaScript = await readFile("scripts/qa-live.ts", "utf8")
    const adminChecks = await readFile("src/domain/live-qa-admin-checks.ts", "utf8")

    // When / Then
    expect(readme).toContain("POST /api/admin/accounts/bulk")
    expect(liveQaScript).toContain('path: "/api/admin/accounts/bulk"')
    expect(liveQaScript).toContain("buildAdminUnknownModelLiveChecks")
    expect(adminChecks).toContain('new URL("/api/admin/accounts/bulk", baseUrl)')
    expect(adminChecks).toContain("grok-live-qa-bulk-missing")
  })

  it("Given dashboard batch import accepts API payloads When reading README Then both JSON shapes are documented", async () => {
    // Given
    const readme = await readFile("README.md", "utf8")

    // When / Then
    expect(readme).toContain('array or `{ "accounts": [...] }` object')
  })

  it("Given Grok CLI OAuth uses native callbacks When reading README Then loopback redirect limits are documented", async () => {
    // Given
    const readme = await readFile("README.md", "utf8")

    // When / Then
    expect(readme).toContain("OAuth start accepts only Grok CLI loopback callbacks")
  })
})
