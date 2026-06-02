# Gorky

Gorky is a Cloudflare Workers proxy for Grok OAuth accounts. It lets you register refreshable Grok CLI accounts, issue custom API keys, restrict those keys to specific models, and call Grok through an OpenAI-compatible surface without exposing raw OAuth token material.

The first supported upstreams are the Grok CLI chat proxy and the public xAI API shape documented in [`docs/reverse-engineering-notes.md`](docs/reverse-engineering-notes.md).

## What It Ships

- Cloudflare Workers + Hono API
- D1-backed account and custom key storage
- AES-GCM encrypted OAuth access/refresh token columns
- Refresh-token rotation with structured API errors on failure
- OpenAI-style `/v1/chat/completions` proxying
- Model allow-lists for custom API keys
- Admin routes for account and key registration
- Structured logs with token/header redaction
- Vite React dashboard with PWA manifest and OpenGraph metadata

## API Surface

```http
POST /api/admin/accounts
POST /api/admin/keys
GET  /api/admin/accounts
POST /v1/chat/completions
GET  /health
```

CLI proxy calls include the required header:

```http
x-grok-client-version: 0.2.16
```

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

## Verification

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
pnpm exec wrangler deploy --dry-run
```

Manual QA evidence for the current implementation lives under `.omo/ulw-loop/evidence/` in the local workspace and is intentionally not meant for public token-bearing commits.

## Security Notes

- OAuth access and refresh tokens are encrypted before D1 persistence.
- API keys are stored by SHA-256 hash and returned only once.
- Logs retain request IDs, key prefixes, status, model, and latency context while redacting credentials.
- Refresh failures return structured API errors and preserve the stored refresh token.
