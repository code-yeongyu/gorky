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
})
