import { execFile } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import { promisify } from "node:util"
import { parseGrokCliAvailableModels, updateWranglerModelIds } from "../src/domain/grok-cli-model-sync.ts"

const execFileAsync = promisify(execFile)
const WRANGLER_CONFIG_PATH = new URL("../wrangler.toml", import.meta.url)

async function main(): Promise<void> {
  const grokBin = process.env["GORKY_GROK_BIN"] ?? "grok"
  const { stdout } = await execFileAsync(grokBin, ["models"])
  const modelIds = parseGrokCliAvailableModels(stdout)
  if (!modelIds.length) {
    throw new Error("No Grok CLI models found. Run `grok login` and retry.")
  }

  const currentConfig = await readFile(WRANGLER_CONFIG_PATH, "utf8")
  const nextConfig = updateWranglerModelIds(currentConfig, modelIds)
  await writeFile(WRANGLER_CONFIG_PATH, nextConfig)
  console.log(`Synced ${modelIds.length} Grok model(s): ${modelIds.join(", ")}`)
}

try {
  await main()
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message)
    process.exitCode = 1
  } else {
    throw error
  }
}
