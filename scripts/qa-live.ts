import { mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium, type Page } from "@playwright/test"
import ky from "ky"
import type { z } from "zod"
import {
  AdminProtectionResponseSchema,
  ApiModelsResponseSchema,
  HealthResponseSchema,
  ManifestResponseSchema,
  V1ModelsResponseSchema,
  assertMatchingModelCatalog,
} from "../src/domain/live-qa.ts"

const DEFAULT_BASE_URL = "https://gorky.code-yeon-gyu.workers.dev"
const SCREENSHOT_DIR = new URL("../.qa/", import.meta.url)

type ViewportScenario = {
  readonly name: string
  readonly width: number
  readonly height: number
}

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 1200 },
] as const satisfies readonly ViewportScenario[]

async function main(): Promise<void> {
  const baseUrl = new URL(process.env["GORKY_LIVE_BASE_URL"] ?? DEFAULT_BASE_URL)
  await runHttpChecks(baseUrl)
  await runRenderChecks(baseUrl)
  console.log(`Live QA passed for ${baseUrl.origin}`)
}

async function runHttpChecks(baseUrl: URL): Promise<void> {
  const health = await getJson(new URL("/health", baseUrl), HealthResponseSchema)
  const apiModels = await getJson(new URL("/api/models", baseUrl), ApiModelsResponseSchema)
  const v1Models = await getJson(new URL("/v1/models", baseUrl), V1ModelsResponseSchema)
  assertMatchingModelCatalog(apiModels, v1Models)

  const adminResponse = await ky.post(new URL("/api/admin/oauth/start", baseUrl), {
    throwHttpErrors: false,
  })
  if (adminResponse.status !== 401) {
    throw new Error(`Expected admin protection to return 401, got ${adminResponse.status}`)
  }
  AdminProtectionResponseSchema.parse(await adminResponse.json())

  const manifest = await getJson(new URL("/manifest.webmanifest", baseUrl), ManifestResponseSchema)
  console.log(
    `HTTP checks ok: service=${health.service} models=${apiModels.models.length} manifest=${manifest.display}`,
  )
}

async function getJson<TSchema extends z.ZodType>(
  url: URL,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  const body = await ky.get(url).json()
  return schema.parse(body)
}

async function runRenderChecks(baseUrl: URL): Promise<void> {
  await mkdir(SCREENSHOT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({ viewport })
      await verifyDashboardPage(page, baseUrl, viewport)
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

async function verifyDashboardPage(
  page: Page,
  baseUrl: URL,
  viewport: ViewportScenario,
): Promise<void> {
  const consoleMessages: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleMessages.push(message.text())
    }
  })
  page.on("pageerror", (error) => {
    consoleMessages.push(error.message)
  })

  await page.goto(baseUrl.href, { waitUntil: "networkidle" })
  await page.waitForSelector("text=Account health and token sets")
  await page.waitForSelector("text=Known models")
  const screenshotPath = fileURLToPath(new URL(`live-dashboard-${viewport.name}.png`, SCREENSHOT_DIR))
  await page.screenshot({ path: screenshotPath, fullPage: true })

  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll("button, input, textarea, output, .account-row, article, .panel")]
      .filter((element) => {
        const style = getComputedStyle(element)
        if (style.visibility === "hidden" || style.display === "none") {
          return false
        }
        return (
          element.scrollWidth > Math.ceil(element.clientWidth + 2) ||
          element.scrollHeight > Math.ceil(element.clientHeight + 2)
        )
      })
      .map((element) => ({
        tag: element.tagName,
        className: String(element.className),
        text: element.textContent?.slice(0, 60) ?? "",
      })),
  )
  if (overflow.length) {
    throw new Error(`${viewport.name} dashboard overflow: ${JSON.stringify(overflow.slice(0, 5))}`)
  }
  if (consoleMessages.length) {
    throw new Error(`${viewport.name} console errors: ${consoleMessages.join(" | ")}`)
  }
  console.log(`Render check ok: ${viewport.name} screenshot=${screenshotPath}`)
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
