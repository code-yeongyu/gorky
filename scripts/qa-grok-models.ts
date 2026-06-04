import { execFile } from "node:child_process"
import { access, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { promisify } from "node:util"
import ky from "ky"
import { ApiModelsResponseSchema, assertModelCatalogContains } from "../src/domain/live-qa.ts"
import {
  buildEmptyGrokModelsDiagnostic,
  type GrokModelsCacheSummary,
  parseGrokCliAvailableModels,
  readWranglerModelIdSets,
  summarizeGrokModelsCache,
} from "../src/domain/grok-cli-model-sync.ts"

const execFileAsync = promisify(execFile)
const DEFAULT_BASE_URL = "https://gorky.code-yeon-gyu.workers.dev"
const WRANGLER_CONFIG_PATH = new URL("../wrangler.toml", import.meta.url)

async function main(): Promise<void> {
  const grokBin = process.env["GORKY_GROK_BIN"] ?? "grok"
  const baseUrl = new URL(process.env["GORKY_LIVE_BASE_URL"] ?? DEFAULT_BASE_URL)
  const { stdout } = await execFileAsync(grokBin, ["models"])
  const cliModels = parseGrokCliAvailableModels(stdout)
  if (!cliModels.length) {
    const grokHome = process.env["GROK_HOME"] ?? `${homedir()}/.grok`
    const authJsonPath = `${grokHome}/auth.json`
    throw new Error(
      buildEmptyGrokModelsDiagnostic({
        authJsonPath,
        authJsonExists: await fileExists(authJsonPath),
        cache: await readModelsCacheSummary(`${grokHome}/models_cache.json`),
        grokBin,
        output: stdout,
      }),
    )
  }

  const wranglerConfig = await readFile(WRANGLER_CONFIG_PATH, "utf8")
  const wranglerModelSets = readWranglerModelIdSets(wranglerConfig)
  const liveModels = ApiModelsResponseSchema.parse(
    await ky.get(new URL("/api/models", baseUrl)).json(),
  ).models

  for (const wranglerModelSet of wranglerModelSets) {
    assertModelCatalogContains(
      cliModels,
      wranglerModelSet.modelIds,
      `wrangler.toml ${wranglerModelSet.label} GROK_MODEL_IDS`,
    )
  }
  assertModelCatalogContains(cliModels, liveModels, "live /api/models")
  console.log(`Grok model parity ok: ${cliModels.join(", ")}`)
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error instanceof Error) {
      return false
    }
    throw error
  }
}

async function readModelsCacheSummary(path: string): Promise<GrokModelsCacheSummary> {
  if (!(await fileExists(path))) {
    return { kind: "missing" }
  }

  try {
    return summarizeGrokModelsCache(JSON.parse(await readFile(path, "utf8")))
  } catch (error) {
    if (error instanceof Error) {
      return { kind: "invalid" }
    }
    throw error
  }
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
