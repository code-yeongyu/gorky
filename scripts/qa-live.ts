import { mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium, type Page } from "@playwright/test"
import ky from "ky"
import type { z } from "zod"
import {
  ApiModelsResponseSchema,
  HealthResponseSchema,
  ManifestResponseSchema,
  V1ModelsResponseSchema,
  assertAdminProtectionResponse,
  assertMatchingModelCatalog,
  assertOpenGraphMetadata,
  assertOAuthUnknownModelResponse,
} from "../src/domain/live-qa.ts"

const DEFAULT_BASE_URL = "https://gorky.code-yeon-gyu.workers.dev"
const SCREENSHOT_DIR = new URL("../.qa/", import.meta.url)

type ViewportScenario = {
  readonly name: string
  readonly width: number
  readonly height: number
}

type ProtectedAdminRequest = {
  readonly label: string
  readonly method: "GET" | "POST"
  readonly path: `/${string}`
}

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 1200 },
] as const satisfies readonly ViewportScenario[]

const ADMIN_PROTECTED_REQUESTS = [
  { label: "list accounts", method: "GET", path: "/api/admin/accounts" },
  { label: "manual account registration", method: "POST", path: "/api/admin/accounts" },
  { label: "disable account", method: "POST", path: "/api/admin/accounts/acct_live_qa/disable" },
  { label: "enable account", method: "POST", path: "/api/admin/accounts/acct_live_qa/enable" },
  { label: "refresh account", method: "POST", path: "/api/admin/accounts/acct_live_qa/refresh" },
  { label: "start OAuth registration", method: "POST", path: "/api/admin/oauth/start" },
  { label: "list key sets", method: "GET", path: "/api/admin/keys" },
  { label: "create key set", method: "POST", path: "/api/admin/keys" },
  { label: "revoke key set", method: "POST", path: "/api/admin/keys/key_live_qa/revoke" },
] as const satisfies readonly ProtectedAdminRequest[]

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

  for (const request of ADMIN_PROTECTED_REQUESTS) {
    const response = await ky(new URL(request.path, baseUrl), {
      method: request.method,
      throwHttpErrors: false,
    })
    assertAdminProtectionResponse(response.status, await response.json(), request.label)
  }

  await runAdminErrorChecks(baseUrl)

  const manifest = await getJson(new URL("/manifest.webmanifest", baseUrl), ManifestResponseSchema)
  console.log(
    `HTTP checks ok: service=${health.service} models=${apiModels.models.length} admin=${ADMIN_PROTECTED_REQUESTS.length} manifest=${manifest.display}`,
  )
}

async function runAdminErrorChecks(baseUrl: URL): Promise<void> {
  const adminToken = process.env["GORKY_LIVE_ADMIN_TOKEN"] ?? process.env["GORKY_ADMIN_TOKEN"]
  if (!adminToken) {
    console.log("OAuth unknown-model live check skipped: set GORKY_LIVE_ADMIN_TOKEN to enable it")
    return
  }

  const response = await ky.post(new URL("/api/admin/oauth/start", baseUrl), {
    headers: { "x-admin-token": adminToken },
    json: {
      redirectUri: new URL("/api/oauth/callback", baseUrl).href,
      modelIds: ["grok-live-qa-missing"],
    },
    throwHttpErrors: false,
  })
  assertOAuthUnknownModelResponse(response.status, await response.json())
  console.log("OAuth unknown-model live check ok")
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
  assertOpenGraphMetadata({
    title: await page.locator('meta[property="og:title"]').getAttribute("content"),
    description: await page.locator('meta[property="og:description"]').getAttribute("content"),
    type: await page.locator('meta[property="og:type"]').getAttribute("content"),
    image: await page.locator('meta[property="og:image"]').getAttribute("content"),
    twitterCard: await page.locator('meta[name="twitter:card"]').getAttribute("content"),
  })
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
