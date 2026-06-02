# Gorky ULW Work Plan

## Context

`gorky` is a greenfield Cloudflare Workers service in `/Users/yeongyu/local-workspaces/grok-oauth-api-proxy`. The repository currently contains only Grok OAuth/API reverse-engineering notes. The implementation must use pnpm, Hono, strict TypeScript, Zod boundary parsing, Biome, Cloudflare Workers, D1/KV, and a Vite React dashboard.

Sibling references:

- `/Users/yeongyu/local-workspaces/ccapi/ccapi-cf`: Cloudflare deployment shape, wrangler envs, request logging, proxy concerns.
- `/Users/yeongyu/local-workspaces/apitopia`: secure API-key hashes/prefixes, allowed model restrictions, D1 schema, admin/dashboard structure.
- `README.md`: Grok OAuth endpoints, refresh behavior, required `x-grok-client-version`, available observed models.

## Success Criteria And Evidence

### SC-API-PROXY

Automated tests:
- `tests/unit/account-refresh.test.ts`: `it("Given an expiring account When ensureFreshAccountToken runs Then it rotates and persists tokens")`
- `tests/integration/chat-completions-route.test.ts`: `it("Given a valid gorky key When chat completions is called Then it forwards with Grok headers")`

Manual QA:
- Channel: HTTP call
- Invocation: `curl -i -X POST http://127.0.0.1:8787/v1/chat/completions -H 'x-api-key: gorky_test_key' -H 'content-type: application/json' --data '{"model":"grok-composer-2.5-fast","messages":[{"role":"user","content":"ping"}],"max_tokens":8}'`
- PASS: HTTP status is `200` and upstream fake capture contains `Authorization: Bearer redacted-access-token` plus `x-grok-client-version: 0.2.16`.
- Evidence: `.omo/ulw-loop/evidence/sc-api-proxy-http.txt`

### SC-REFRESH-ERROR

Automated tests:
- `tests/unit/account-refresh.test.ts`: `it("Given refresh returns invalid_grant When ensureFreshAccountToken runs Then it returns api error and preserves refresh token")`
- `tests/integration/chat-completions-route.test.ts`: `it("Given refresh fails When chat completions is called Then caller receives upstream auth api error")`

Manual QA:
- Channel: HTTP call
- Invocation: `curl -i -X POST http://127.0.0.1:8787/__qa/fail-refresh-then-chat -H 'x-api-key: gorky_test_key' -H 'content-type: application/json' --data '{"model":"grok-composer-2.5-fast","messages":[{"role":"user","content":"ping"}]}'`
- PASS: HTTP status is `502`, body includes `{"error":{"type":"grok_refresh_error"}}`, and evidence shows stored refresh token suffix unchanged.
- Evidence: `.omo/ulw-loop/evidence/sc-refresh-error-http.txt`

### SC-TOKEN-SETS

Automated tests:
- `tests/unit/api-key.test.ts`: `it("Given an allowed model set When key is verified Then disallowed models are rejected")`
- `tests/integration/admin-keys-route.test.ts`: `it("Given admin auth When creating a key Then only prefix is returned and hash is stored")`

Manual QA:
- Channel: HTTP call
- Invocation: `curl -i -X POST http://127.0.0.1:8787/api/admin/keys -H 'x-admin-token: dev-admin-token' -H 'content-type: application/json' --data '{"name":"qa-key","allowedModels":["grok-composer-2.5-fast"]}'`
- PASS: HTTP status is `201`, response includes one plaintext key once, includes `keyPrefix`, and no `keyHash`.
- Evidence: `.omo/ulw-loop/evidence/sc-token-sets-http.txt`

### SC-MULTI-ACCOUNT

Automated tests:
- `tests/integration/admin-accounts-route.test.ts`: `it("Given admin auth When listing accounts Then token fields are redacted")`
- `tests/unit/account-selection.test.ts`: `it("Given multiple active accounts When selecting for a model Then least recently used account is chosen")`

Manual QA:
- Channel: Browser use
- Invocation: Playwright opens `http://127.0.0.1:4173/accounts`, logs in with `dev-admin-token`, adds two QA accounts through mocked API, and screenshots the account table.
- PASS: screenshot shows two accounts with status/expiry/model chips and no raw token-like strings.
- Evidence: `.omo/ulw-loop/evidence/sc-multi-account-browser.png` and `.omo/ulw-loop/evidence/sc-multi-account-browser.txt`

### SC-FRONTEND-PWA

Automated tests:
- `tests/integration/frontend-metadata.test.ts`: `it("Given the built dashboard When metadata files are inspected Then PWA and OpenGraph assets exist")`

Manual QA:
- Channel: Browser use
- Invocation: Playwright opens production preview at `http://127.0.0.1:4173/`, checks dashboard render, manifest link, OpenGraph tags, mobile viewport `375x812`, desktop viewport `1280x800`, and screenshots both.
- PASS: screenshots show non-overlapping dashboard UI, manifest fetch is `200`, and `og:title` is `Gorky`.
- Evidence: `.omo/ulw-loop/evidence/sc-frontend-pwa-mobile.png`, `.omo/ulw-loop/evidence/sc-frontend-pwa-desktop.png`, `.omo/ulw-loop/evidence/sc-frontend-pwa-browser.txt`

### SC-SECURITY-LOGGING

Automated tests:
- `tests/unit/redaction.test.ts`: `it("Given sensitive headers and OAuth fields When redaction runs Then no raw secret remains")`
- `tests/integration/request-logging.test.ts`: `it("Given an authenticated request When logs are captured Then only key prefix and request metadata are emitted")`

Manual QA:
- Channel: HTTP call
- Invocation: `curl -i http://127.0.0.1:8787/__qa/redaction -H 'Authorization: Bearer sk-real-looking-secret' -H 'x-api-key: gorky_test_key'`
- PASS: body contains `[REDACTED]`, request ID, key prefix, and no raw bearer/api key.
- Evidence: `.omo/ulw-loop/evidence/sc-security-logging-http.txt`

## Wave Order

### Wave 1: Foundation And RED Tests

Can run in parallel:
- Scaffold pnpm workspace, strict TS, Biome, Hono Worker entry, Vite React app, `wrangler.toml`, migrations, and DESIGN.md.
- Write all RED tests listed above before production behavior.

Blocks all later waves.

### Wave 2: Core Domain

Can run in parallel after Wave 1:
- Account token encryption/redaction/refresh domain.
- API key generation/hash/prefix/model-restriction domain.
- Model catalog and upstream routing/header policy.
- Structured logging and request context.

Blocks route implementation.

### Wave 3: API Routes And D1/KV Wiring

Can run in parallel after Wave 2:
- `/v1/chat/completions` and `/v1/responses` proxy routes.
- Admin accounts and keys routes.
- QA-only routes gated by `GORKY_QA_MODE=true` for deterministic manual QA.
- D1 migrations and repository adapters.

Blocks manual HTTP QA.

### Wave 4: Dashboard, PWA, OpenGraph

Can run in parallel with Wave 3 after shared types exist:
- React dashboard shell, login, accounts, keys, health/status.
- CSS tokens from DESIGN.md; x.ai-inspired dark technical dashboard with friendly copy.
- Manifest, icons, OpenGraph/Twitter tags, responsive states.

Blocks browser QA.

### Wave 5: Verification, Review, GitHub Ship

Serial:
- Run `pnpm install`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- Run HTTP QA scenarios and browser QA screenshots.
- Run final ultrawork reviewer.
- Initialize git, commit atomic waves, create public GitHub repo `gorky`, set description/topics, push after clean verification.

## Architecture Decisions

- Token storage: D1 stores metadata and encrypted token ciphertext; encryption key comes from `TOKEN_ENCRYPTION_SECRET`.
- Login state: KV stores PKCE/state with TTL for OAuth registration.
- Account registration: supports admin-provided redacted OAuth token payload in local/dev and stores refreshable account records; OAuth authorize/callback endpoints are included for production browser flow.
- Refresh: if access token expires within five minutes, refresh once, atomically persist rotated refresh token, retry upstream once on `401`.
- Errors: expected upstream/account failures become OpenAI-style JSON API errors with explicit `type` and `code`; raw token details never escape.
- Models: start with observed `grok-composer-2.5-fast` and `grok-build`; catalog is config-driven so more `grok-cli` models can be added without code changes.
- Headers: CLI proxy requests always include `x-grok-client-version: 0.2.16`; public API requests do not.
- Dashboard: no raw tokens shown. Account rows expose email, principal type, status, expiry, model list, and last used.

## Cleanup Receipts Required

Every manual QA artifact must include:
- server PID killed and port clear, or preview session closed;
- browser closed;
- temp file directory removed;
- no tmux session left if tmux was used.
