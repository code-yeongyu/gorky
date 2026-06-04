import { execFile } from "node:child_process"
import { access, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { promisify } from "node:util"
import {
  buildEmptyGrokModelsDiagnostic,
  buildMissingGrokBinaryDiagnostic,
  COMMON_LOCAL_GROK_BIN_PATH,
  type GrokModelsCacheSummary,
  parseGrokCliAvailableModels,
  resolveGrokBinaryPath,
  summarizeGrokModelsCache,
  updateWranglerModelIds,
} from "../src/domain/grok-cli-model-sync.ts"

const execFileAsync = promisify(execFile)
const WRANGLER_CONFIG_PATH = new URL("../wrangler.toml", import.meta.url)

async function main(): Promise<void> {
  const grokBin = resolveGrokBinaryPath({
    configuredBin: process.env["GORKY_GROK_BIN"],
    commonLocalBinExists: await fileExists(COMMON_LOCAL_GROK_BIN_PATH),
  })
  const stdout = await readGrokModelsOutput(grokBin)
  const modelIds = parseGrokCliAvailableModels(stdout)
  if (!modelIds.length) {
    const grokHome = process.env["GROK_HOME"] ?? `${homedir()}/.grok`
    const authJsonPath = `${grokHome}/auth.json`
    throw new Error(
      buildEmptyGrokModelsDiagnostic({
        authJsonPath,
        authJsonExists: await fileExists(authJsonPath),
        cache: await readModelsCacheSummary(`${grokHome}/models_cache.json`),
        grokBin,
        output: stdout,
        rerunCommand: "pnpm models:sync",
      }),
    )
  }

  const currentConfig = await readFile(WRANGLER_CONFIG_PATH, "utf8")
  const nextConfig = updateWranglerModelIds(currentConfig, modelIds)
  await writeFile(WRANGLER_CONFIG_PATH, nextConfig)
  console.log(`Synced ${modelIds.length} Grok model(s): ${modelIds.join(", ")}`)
}

async function readGrokModelsOutput(grokBin: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(grokBin, ["models"])
    return stdout
  } catch (error) {
    if (isMissingExecutableError(error)) {
      throw new Error(buildMissingGrokBinaryDiagnostic(grokBin))
    }
    throw error
  }
}

function isMissingExecutableError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
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
