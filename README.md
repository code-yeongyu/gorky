# Gorky

Gorky is a Cloudflare Workers proxy for Grok OAuth accounts. It lets you register refreshable Grok CLI accounts, issue custom API keys, restrict those keys to specific models, and call Grok through an OpenAI-compatible surface without exposing raw OAuth token material.

The first supported upstreams are the Grok CLI chat proxy and the public xAI API shape documented in [`docs/reverse-engineering-notes.md`](docs/reverse-engineering-notes.md).

## What It Ships

- Cloudflare Workers + Hono API
- D1-backed account and custom key storage
- AES-GCM encrypted OAuth access/refresh token columns
- Refresh-token rotation with structured API errors on failure
- OpenAI-style `/v1/chat/completions` proxying
- OpenAI-compatible `/v1/models` discovery for Grok CLI custom endpoints
- Model allow-lists for custom API keys
- Admin routes for account and key registration
- Structured logs with token/header redaction
- Vite React dashboard with PWA manifest and OpenGraph metadata

## API Surface

```http
POST /api/admin/accounts
POST /api/admin/oauth/start
POST /api/admin/keys
GET  /api/admin/accounts
GET  /api/admin/keys
GET  /api/oauth/callback
GET  /v1/models
POST /v1/chat/completions
POST /v1/responses
GET  /health
```

CLI proxy calls include the required Grok CLI session headers:

```http
X-XAI-Token-Auth: xai-grok-cli
x-grok-client-version: 0.2.16
x-grok-model-override: <requested-model>
```

## Use With Grok CLI

Create a Gorky API key in the dashboard or admin API, then point Grok CLI at
the deployed Worker:

```bash
export GROK_MODELS_BASE_URL="https://gorky.code-yeon-gyu.workers.dev/v1"
export GROK_CODE_XAI_API_KEY="gorky_..."
grok models
grok -m grok-build -p "Say hello through Gorky"
```

`GROK_MODELS_BASE_URL` makes Grok fetch
`https://gorky.code-yeon-gyu.workers.dev/v1/models`, and
`GROK_CODE_XAI_API_KEY` is sent as `Authorization: Bearer ...`. The same key
also works with `x-api-key` for direct API calls.

After authenticating the local Grok CLI, sync every currently available model
into the Worker config before deploying:

```bash
GORKY_GROK_BIN=/Users/yeongyu/.grok/bin/grok pnpm models:sync
pnpm exec wrangler deploy
```

The sync command refuses to update `wrangler.toml` when `grok models` returns no
available models, which usually means the CLI is not authenticated yet.

## Local Setup

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm build
pnpm dev
```

Set real local secrets in `.dev.vars`. Do not put `ADMIN_TOKEN`, OAuth tokens, or `TOKEN_ENCRYPTION_SECRET` in `wrangler.toml`.

## Cloudflare Setup

Create D1 and KV resources, update `wrangler.toml`, then apply migrations:

```bash
wrangler d1 migrations apply gorky-db --local
wrangler d1 migrations apply gorky-db --remote
wrangler secret put ADMIN_TOKEN
wrangler secret put TOKEN_ENCRYPTION_SECRET
```

`LOGIN_STATE` is used for short-lived OAuth PKCE state during account
registration. The callback stores only encrypted token material and returns a
redacted account record.

## Verification

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
pnpm exec wrangler deploy --dry-run
pnpm qa:live
GORKY_GROK_BIN=/Users/yeongyu/.grok/bin/grok pnpm qa:grok-models
```

`pnpm qa:live` checks the deployed Worker health, model catalogs, admin
protection, PWA manifest, and desktop/mobile dashboard rendering. Screenshots
are written to `.qa/`, which is ignored so token-bearing manual evidence does
not enter public commits.

`pnpm qa:grok-models` requires an authenticated local Grok CLI. It compares
`grok models` with `wrangler.toml` and the deployed `/api/models` catalog so
every CLI-available model is exposed by Gorky before release.

## Security Notes

- OAuth access and refresh tokens are encrypted before D1 persistence.
- API keys are stored by SHA-256 hash and returned only once.
- Logs retain request IDs, key prefixes, status, model, and latency context while redacting credentials.
- Refresh failures return structured API errors and preserve the stored refresh token.
