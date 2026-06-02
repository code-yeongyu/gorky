import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { promisify } from "node:util"
import ky from "ky"
import { ApiModelsResponseSchema, assertModelCatalogContains } from "../src/domain/live-qa.ts"
import { parseGrokCliAvailableModels } from "../src/domain/grok-cli-model-sync.ts"
import { parseGrokModelIds } from "../src/domain/models.ts"

const execFileAsync = promisify(execFile)
const DEFAULT_BASE_URL = "https://gorky.code-yeon-gyu.workers.dev"
const WRANGLER_CONFIG_PATH = new URL("../wrangler.toml", import.meta.url)

async function main(): Promise<void> {
  const grokBin = process.env["GORKY_GROK_BIN"] ?? "grok"
  const baseUrl = new URL(process.env["GORKY_LIVE_BASE_URL"] ?? DEFAULT_BASE_URL)
  const { stdout } = await execFileAsync(grokBin, ["models"])
  const cliModels = parseGrokCliAvailableModels(stdout)
  if (!cliModels.length) {
    throw new Error("No Grok CLI models found. Run `grok login` and retry.")
  }

  const wranglerConfig = await readFile(WRANGLER_CONFIG_PATH, "utf8")
  const wranglerModels = readWranglerModelIds(wranglerConfig)
  const liveModels = ApiModelsResponseSchema.parse(
    await ky.get(new URL("/api/models", baseUrl)).json(),
  ).models

  assertModelCatalogContains(cliModels, wranglerModels, "wrangler.toml GROK_MODEL_IDS")
  assertModelCatalogContains(cliModels, liveModels, "live /api/models")
  console.log(`Grok model parity ok: ${cliModels.join(", ")}`)
}

function readWranglerModelIds(toml: string): readonly string[] {
  const match = toml.match(/^GROK_MODEL_IDS = "([^"]*)"$/m)
  if (!match) {
    throw new Error("wrangler.toml is missing GROK_MODEL_IDS")
  }
  return parseGrokModelIds(match[1])
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
