# Grok OAuth API Proxy Reverse-Engineering Notes

Status: field-tested on 2026-06-02  
Local Grok CLI version tested: `grok 0.2.16 (f7c09b8d8a2)`  
Primary model tested: `grok-composer-2.5-fast`  
Primary CLI API proxy tested: `https://cli-chat-proxy.grok.com/v1`  
Primary public xAI API endpoint tested: `https://api.x.ai/v1`

This document captures everything discovered while installing, logging in to, and directly calling the xAI/Grok Build CLI API surface using the local Grok CLI user-session tokens. It is intentionally verbose and operational: the goal is to preserve enough implementation detail to build a small OAuth/API proxy or a compatibility layer without having to rediscover the moving parts.

All token values in this document are redacted. Do not commit or log real values from `~/.grok/auth.json`.

## Executive Summary

Grok Build CLI authentication is an OIDC/OAuth2 login flow against `https://auth.x.ai`. A successful `grok login` stores a user-session access token and refresh token under `~/.grok/auth.json`.

The cached access token can be used directly as a bearer token for both:

- The public xAI API, for example `https://api.x.ai/v1/responses`
- The Grok CLI chat proxy, for example `https://cli-chat-proxy.grok.com/v1/chat/completions`

For the CLI chat proxy, a version header is required:

```http
x-grok-client-version: 0.2.16
```

Without that header, direct calls to the CLI proxy return HTTP `426` with an error saying the Grok CLI version is `none` and outdated.

Tool calling works through `grok-composer-2.5-fast` using OpenAI-style `tools` and assistant `tool_calls`, followed by `role: "tool"` result messages. Composer responses may include both `message.content` and `message.reasoning_content`; treat `tool_calls` as the authoritative signal when `finish_reason` is `tool_calls`.

Refresh-token rotation is active or at least possible. A refresh request returned both a new access token and a new refresh token. Any proxy that refreshes tokens must persist the new refresh token atomically.

The login is tied to a Grok user account, not merely an xAI API key. The observed principal type was `User`, with scopes including `grok-cli:access` and `api:access`.

## Known Endpoints

### OIDC Discovery

```text
GET https://auth.x.ai/.well-known/openid-configuration
```

Observed relevant response fields:

```json
{
  "issuer": "https://auth.x.ai",
  "authorization_endpoint": "https://auth.x.ai/oauth2/authorize",
  "token_endpoint": "https://auth.x.ai/oauth2/token",
  "revocation_endpoint": "https://auth.x.ai/oauth2/revoke",
  "grant_types_supported": [
    "authorization_code",
    "refresh_token",
    "urn:ietf:params:oauth:grant-type:device_code"
  ],
  "token_endpoint_auth_methods_supported": [
    "client_secret_basic",
    "client_secret_post",
    "none"
  ],
  "scopes_supported": [
    "openid",
    "profile",
    "email",
    "offline_access",
    "grok-cli:access",
    "team:read",
    "org:read",
    "api:access",
    "office-addins:access"
  ]
}
```

### Browser Authorization Endpoint

```text
GET https://auth.x.ai/oauth2/authorize
```

Observed from `grok login`:

```text
https://auth.x.ai/oauth2/authorize
  ?response_type=code
  &client_id=b1a00492-073a-47ea-816f-4c329264a828
  &redirect_uri=http%3A%2F%2F127.0.0.1%3A<local-port>%2Fcallback
  &scope=openid%20profile%20email%20offline_access%20grok-cli%3Aaccess%20api%3Aaccess
  &code_challenge=<pkce-code-challenge>
  &code_challenge_method=S256
  &state=<uuid-like-state>
  &nonce=<uuid-like-nonce>
  &referrer=grok-build
```

The redirect URI is a local loopback callback opened by the CLI. The CLI receives the authorization code, exchanges it at the token endpoint, and writes credentials to `~/.grok/auth.json`.

### Token Endpoint

```text
POST https://auth.x.ai/oauth2/token
```

Used for authorization-code exchange and refresh-token exchange.

### Public API

```text
https://api.x.ai/v1
```

Confirmed working endpoint with the Grok login access token:

```text
POST https://api.x.ai/v1/responses
```

### Grok CLI Chat Proxy

```text
https://cli-chat-proxy.grok.com/v1
```

Confirmed working endpoint with the Grok login access token:

```text
POST https://cli-chat-proxy.grok.com/v1/chat/completions
```

Confirmed models surfaced by `grok models` after login:

```text
grok-composer-2.5-fast
grok-build
```

The local config can also add custom models, but those are separate from xAI-hosted Grok models.

## Local Files and Credential Storage

### Credential File

```text
~/.grok/auth.json
```

Observed scope key:

```text
https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828
```

Observed redacted structure:

```json
{
  "https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828": {
    "auth_mode": "oidc",
    "coding_data_retention_opt_out": "<boolean-or-null>",
    "create_time": "2026-06-02T06:15:52.272693Z",
    "email": "<user-email>",
    "expires_at": "2026-06-02T12:15:52.272693Z",
    "first_name": "<redacted>",
    "key": "<redacted-access-token>",
    "last_name": "<redacted>",
    "oidc_client_id": "b1a00492-073a-47ea-816f-4c329264a828",
    "oidc_issuer": "https://auth.x.ai",
    "principal_id": "<uuid>",
    "principal_type": "User",
    "refresh_token": "<redacted-refresh-token>",
    "team_id": "<uuid>",
    "user_id": "<uuid>"
  }
}
```

Important fields:

- `key`: access token used as `Authorization: Bearer ...`
- `refresh_token`: OAuth refresh token
- `expires_at`: ISO timestamp for access-token expiry
- `oidc_client_id`: public OAuth client ID used by Grok CLI
- `principal_type`: observed as `User`
- `email`: confirms that this is tied to a Grok user account
- `team_id`: present, so account/team entitlement can be relevant

### Config File

```text
~/.grok/config.toml
```

Relevant model config used locally:

```toml
[models]
default = "grok-composer-2.5-fast"
default_reasoning_effort = "low"
```

The CLI warns if obsolete keys such as `cli.default` are present. Use `[models].default`.

## OAuth Login Flow

The login flow is standard OAuth2 Authorization Code with PKCE.

### High-Level Flow

1. Run `grok login`.
2. CLI starts a local loopback callback server, for example:

   ```text
   http://127.0.0.1:<port>/callback
   ```

3. CLI opens or prints an authorization URL for `https://auth.x.ai/oauth2/authorize`.
4. User authenticates in browser.
5. Browser redirects back to the local callback with an authorization code.
6. CLI exchanges the authorization code at `https://auth.x.ai/oauth2/token`.
7. CLI stores access token, refresh token, and user metadata in `~/.grok/auth.json`.
8. CLI uses the cached token for `cli-chat-proxy.grok.com` and `api.x.ai`.
9. CLI refreshes the access token when necessary using `grant_type=refresh_token`.

### Login Parameters

Observed authorization request parameters:

| Parameter | Observed Value |
| --- | --- |
| `response_type` | `code` |
| `client_id` | `b1a00492-073a-47ea-816f-4c329264a828` |
| `redirect_uri` | `http://127.0.0.1:<port>/callback` |
| `scope` | `openid profile email offline_access grok-cli:access api:access` |
| `code_challenge_method` | `S256` |
| `code_challenge` | PKCE SHA-256 challenge |
| `state` | random/UUID-like |
| `nonce` | random/UUID-like |
| `referrer` | `grok-build` |

### Headless/Device-Code Possibility

OIDC discovery advertises:

```text
urn:ietf:params:oauth:grant-type:device_code
```

This strongly suggests device-code login is supported by the auth server. The CLI help also mentioned non-browser environments can use an API key, and error text suggested `grok login --device-code` may exist. This should be verified separately with the exact CLI version before building a production headless-login flow.

## Access Token Details

The access token stored in `auth.json` is JWT-like.

Observed decoded claims, redacted:

```json
{
  "iss": "https://auth.x.ai",
  "aud": "b1a00492-073a-47ea-816f-4c329264a828",
  "sub": "<user-id-uuid>",
  "exp": 1780402551,
  "exp_iso": "2026-06-02T12:15:51+00:00",
  "iat": 1780380951,
  "iat_iso": "2026-06-02T06:15:51+00:00",
  "scope": "openid profile email offline_access grok-cli:access api:access",
  "client_id": "b1a00492-073a-47ea-816f-4c329264a828"
}
```

The observed access token lifetime was 21,600 seconds, or 6 hours.

## Refresh Token Flow

### Request

Endpoint:

```text
POST https://auth.x.ai/oauth2/token
```

Headers:

```http
Content-Type: application/x-www-form-urlencoded
```

Form:

```text
grant_type=refresh_token
client_id=b1a00492-073a-47ea-816f-4c329264a828
refresh_token=<redacted-refresh-token>
```

Equivalent curl:

```bash
SCOPE='https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828'
CLIENT_ID=$(jq -r --arg scope "$SCOPE" '.[$scope].oidc_client_id' ~/.grok/auth.json)
REFRESH_TOKEN=$(jq -r --arg scope "$SCOPE" '.[$scope].refresh_token' ~/.grok/auth.json)

curl -sS https://auth.x.ai/oauth2/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=refresh_token' \
  --data-urlencode "client_id=${CLIENT_ID}" \
  --data-urlencode "refresh_token=${REFRESH_TOKEN}"
```

### Observed Redacted Response

```json
{
  "access_token": "<redacted:access_token:len=818>",
  "token_type": "Bearer",
  "expires_in": 21600,
  "refresh_token": "<redacted:refresh_token:len=86>",
  "scope": "openid profile email offline_access grok-cli:access api:access"
}
```

Observed access-token claims after refresh:

```json
{
  "iss": "https://auth.x.ai",
  "aud": "b1a00492-073a-47ea-816f-4c329264a828",
  "sub": "<user-id-uuid>",
  "scope": "openid profile email offline_access grok-cli:access api:access",
  "client_id": "b1a00492-073a-47ea-816f-4c329264a828",
  "exp": 1780403209,
  "iat": 1780381609,
  "exp_iso": "2026-06-02T12:26:49+00:00",
  "iat_iso": "2026-06-02T06:26:49+00:00"
}
```

### Refresh Token Rotation

The refresh response included a new `refresh_token`. A proxy must assume rotation and must update stored state atomically:

1. Call token endpoint using the old refresh token.
2. Verify HTTP 200 and presence of a new access token.
3. If the response includes a new refresh token, replace the old refresh token.
4. Update `key`, `refresh_token`, `create_time`, and `expires_at` together.
5. Persist using a temp file plus atomic rename to avoid corrupting `auth.json`.

Never discard a successful refresh response if it contains a rotated refresh token. Doing so can leave the local login unusable.

### Local `auth.json` Update Pattern

Pseudo-shell:

```bash
SCOPE='https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828'
NEW_ACCESS='<from refresh response access_token>'
NEW_REFRESH='<from refresh response refresh_token or old refresh token>'
CREATE_TIME="$(date -u +%Y-%m-%dT%H:%M:%S.%6NZ)"
EXPIRES_AT='<now + expires_in seconds in ISO UTC>'

tmp="$(mktemp)"
jq \
  --arg scope "$SCOPE" \
  --arg key "$NEW_ACCESS" \
  --arg refresh "$NEW_REFRESH" \
  --arg create "$CREATE_TIME" \
  --arg expires "$EXPIRES_AT" \
  '.[$scope].key=$key
   | .[$scope].refresh_token=$refresh
   | .[$scope].create_time=$create
   | .[$scope].expires_at=$expires' \
  ~/.grok/auth.json > "$tmp"
chmod 600 "$tmp"
mv "$tmp" ~/.grok/auth.json
```

## CLI Proxy Version Header

Direct calls to `https://cli-chat-proxy.grok.com/v1/chat/completions` require:

```http
x-grok-client-version: 0.2.16
```

### Failed Request Without Header

Request:

```bash
curl -sS https://cli-chat-proxy.grok.com/v1/chat/completions \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"model":"grok-composer-2.5-fast","messages":[{"role":"user","content":"Reply with exactly: API_OK"}]}'
```

Observed response:

```json
{
  "error": "Your Grok CLI version (none) is outdated. Please update to version 0.1.202 or later via `grok update` or the installation documentation."
}
```

HTTP status:

```text
426
```

### Header Candidates Tested

The following candidates did not satisfy the version check:

```text
x-grok-cli-version: 0.2.16
x-cli-version: 0.2.16
grok-cli-version: 0.2.16
x-client-version: 0.2.16
User-Agent: grok/0.2.16
```

The working header was:

```text
x-grok-client-version: 0.2.16
```

## Public API Request Test

The Grok login access token worked with the public xAI API.

Request:

```bash
TOKEN=$(jq -r '.[
  "https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828"
].key' ~/.grok/auth.json)

curl -sS https://api.x.ai/v1/responses \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "grok-build-0.1",
    "input": "Reply with exactly: API_OK_XAI"
  }'
```

Observed response summary:

```json
{
  "status": "completed",
  "model": "grok-build-0.1",
  "output_text": "API_OK_XAI",
  "usage": {
    "input_tokens": 132,
    "output_tokens": 203,
    "total_tokens": 335
  }
}
```

Note: the `responses` endpoint may include reasoning output plus final message output. Extract final text from the message `output_text`, not the reasoning summary.

## Composer Chat Completions Request

### Minimal Request

```bash
TOKEN=$(jq -r '.[
  "https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828"
].key' ~/.grok/auth.json)

curl -sS https://cli-chat-proxy.grok.com/v1/chat/completions \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'x-grok-client-version: 0.2.16' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "grok-composer-2.5-fast",
    "messages": [
      {"role": "user", "content": "Reply with exactly: API_OK"}
    ],
    "temperature": 0,
    "max_tokens": 16
  }'
```

Observed:

- HTTP `200`
- `object`: `chat.completion`
- `model`: `grok-composer-2.5-fast`
- Sometimes `message.reasoning_content` contains the requested exact string
- Sometimes `message.content` contains unexpected agent-like text from unrelated coding contexts
- Sometimes `finish_reason` is `tool_calls`

Interpretation: the CLI proxy accepts an OpenAI-ish chat-completions shape, but Composer appears tuned/wrapped for agentic coding. For reliable plain text, extra framing may be required, and `message.content` is not always as clean as the public `responses` endpoint.

## Tool Calling with Composer

Tool calling works.

### First Turn: Ask Model to Call a Tool

Request:

```bash
TOKEN=$(jq -r '.[
  "https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828"
].key' ~/.grok/auth.json)

curl -sS https://cli-chat-proxy.grok.com/v1/chat/completions \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'x-grok-client-version: 0.2.16' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "grok-composer-2.5-fast",
    "messages": [
      {
        "role": "system",
        "content": "You are testing tool calling. If the user asks for weather, call the provided get_weather tool. Do not answer directly."
      },
      {
        "role": "user",
        "content": "서울 날씨 확인해줘."
      }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get current weather for a city.",
          "parameters": {
            "type": "object",
            "properties": {
              "city": {"type": "string"},
              "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
            },
            "required": ["city", "unit"],
            "additionalProperties": false
          }
        }
      }
    ],
    "tool_choice": "auto",
    "temperature": 0,
    "max_tokens": 512,
    "stream": false
  }'
```

Observed response:

```json
{
  "id": "<completion-id>",
  "model": "grok-composer-2.5-fast",
  "content": "도구 호출이 필요합니다.\n",
  "finish_reason": "tool_calls",
  "tool_calls": [
    {
      "id": "call-...-composer_call_...",
      "function": {
        "name": "get_weather",
        "arguments": "{\"city\":\"Seoul\",\"unit\":\"celsius\"}"
      },
      "type": "function"
    }
  ],
  "error": null
}
```

Key behavior:

- `finish_reason` becomes `tool_calls`
- `message.tool_calls` is populated
- `function.arguments` is a JSON string, as in OpenAI-compatible chat completions
- `message.content` may contain a small natural-language note; ignore it for dispatch and use `tool_calls`

### Second Turn: Submit Tool Result

Request:

```bash
curl -sS https://cli-chat-proxy.grok.com/v1/chat/completions \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'x-grok-client-version: 0.2.16' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "grok-composer-2.5-fast",
    "messages": [
      {"role": "user", "content": "서울 날씨 확인해줘."},
      {
        "role": "assistant",
        "content": "도구 호출이 필요합니다.\n",
        "tool_calls": [
          {
            "id": "call_test_weather_1",
            "type": "function",
            "function": {
              "name": "get_weather",
              "arguments": "{\"city\":\"Seoul\",\"unit\":\"celsius\"}"
            }
          }
        ]
      },
      {
        "role": "tool",
        "tool_call_id": "call_test_weather_1",
        "content": "{\"city\":\"Seoul\",\"temperature\":23,\"unit\":\"celsius\",\"condition\":\"clear\"}"
      }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get current weather for a city.",
          "parameters": {
            "type": "object",
            "properties": {
              "city": {"type": "string"},
              "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
            },
            "required": ["city", "unit"]
          }
        }
      }
    ],
    "temperature": 0,
    "max_tokens": 256,
    "stream": false
  }'
```

Observed response:

```json
{
  "model": "grok-composer-2.5-fast",
  "content": "서울 현재 날씨는 **23°C**, 날씨는 **맑음**입니다.",
  "finish_reason": "stop",
  "tool_calls": [],
  "error": null
}
```

This confirms OpenAI-style two-step function calling works:

1. Model emits `assistant.tool_calls`
2. Caller executes the tool
3. Caller appends `role: "tool"` with matching `tool_call_id`
4. Model produces final text with `finish_reason: "stop"`

### Post-Refresh Tool Call Test

After refreshing the OAuth token and updating `auth.json`, the refreshed token was tested with another tool call.

Request intent:

```text
Call add tool to compute 2 + 3.
```

Observed response:

```json
{
  "model": "grok-composer-2.5-fast",
  "finish_reason": "tool_calls",
  "tool_calls": [
    {
      "function": {
        "name": "add",
        "arguments": "{\"a\":2.0,\"b\":3.0}"
      },
      "type": "function"
    }
  ],
  "error": null
}
```

This confirms refreshed tokens continue to work for Composer tool calling.

## `tool_choice` Behavior

Sending `tool_choice: "none"` without tools produced:

```json
{
  "error": "Invalid request content: A tool_choice was set on the request but no tools were specified."
}
```

HTTP status:

```text
400
```

Sending `tools: []` plus `tool_choice: "none"` still produced the same error. The proxy appears to consider an empty tool list equivalent to no tools. Avoid `tool_choice` unless you provide at least one real tool definition.

## Account Binding and Entitlements

This is not merely an anonymous API key.

Observed local account metadata after login:

```json
{
  "email": "<grok-account-email>",
  "principal_type": "User",
  "user_id": "<uuid>",
  "team_id": "<uuid>",
  "expires_at": "2026-06-02T12:26:49.350078Z",
  "has_key": true,
  "has_refresh_token": true
}
```

Observed scopes:

```text
openid profile email offline_access grok-cli:access api:access
```

Implications:

- Access is tied to the logged-in Grok account.
- Composer/Grok Build availability likely depends on the account subscription/team entitlement.
- The same user-session token can access `api.x.ai/v1/responses` when it includes `api:access`.
- The CLI proxy probably checks `grok-cli:access` and/or subscription state.
- The token should be handled as a user credential, not a service key.

## Model IDs and Names

Observed from `grok models` after login:

```text
Default model: grok-composer-2.5-fast

Available models:
  * grok-composer-2.5-fast (default)
  - grok-build
```

Model metadata observed in initialize logs:

```json
{
  "modelId": "grok-composer-2.5-fast",
  "name": "Composer 2.5",
  "description": "Cursor's latest coding model",
  "_meta": {
    "totalContextTokens": 200000,
    "agentType": "cursor"
  }
}
```

```json
{
  "modelId": "grok-build",
  "name": "Grok Build",
  "description": "Best for advanced coding tasks",
  "_meta": {
    "totalContextTokens": 512000,
    "agentType": "grok-build-plan"
  }
}
```

Public API model tested:

```text
grok-build-0.1
```

The CLI model ID `grok-build` and public API model ID `grok-build-0.1` are not identical. Treat CLI proxy and public API model IDs as separate namespaces unless confirmed otherwise.

## Headers and Request Requirements

### Public API

Minimum:

```http
Authorization: Bearer <access-token>
Content-Type: application/json
```

### CLI Chat Proxy

Minimum:

```http
Authorization: Bearer <access-token>
x-grok-client-version: 0.2.16
Content-Type: application/json
```

Recommended:

```http
User-Agent: grok/0.2.16
```

`User-Agent` alone is not sufficient for the proxy version check.

## Proxy Implementation Guidance

### Minimal Responsibilities

A `grok-oauth-api-proxy` service should probably do the following:

1. Load `~/.grok/auth.json` or its own encrypted credential store.
2. Select the scope key:

   ```text
   https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828
   ```

3. Check `expires_at` before each upstream call.
4. Refresh if expired or near expiry.
5. Persist both access and refresh tokens if refresh succeeds.
6. Forward requests to one of:
   - `https://cli-chat-proxy.grok.com/v1`
   - `https://api.x.ai/v1`
7. Add required proxy headers: `X-XAI-Token-Auth`, `x-grok-client-version`, and `x-grok-model-override`.
8. Redact secrets from logs.
9. Preserve streaming behavior if supporting `stream: true`.
10. Preserve OpenAI-style tool-call fields exactly.

### Suggested Refresh Window

Refresh when:

```text
now >= expires_at - 300 seconds
```

This avoids racing an expiry during long requests.

### Atomic Credential Update

Use file locking plus atomic rename. Example approach:

- Acquire lock file, for example `~/.grok/auth.json.lock`
- Read current `auth.json`
- Re-check whether another process already refreshed
- Refresh only if still needed
- Write temp file in same directory
- `chmod 600`
- Rename temp file to `auth.json`
- Release lock

The local `~/.grok/auth.json.lock` file exists in the Grok directory, so the CLI may use similar locking. A proxy sharing the same file should respect this to avoid token races.

### Error Handling

Suggested handling:

| Status/Error | Likely Meaning | Action |
| --- | --- | --- |
| `401` from upstream | Access token invalid/expired | Refresh once, retry once |
| `426` from CLI proxy | Missing/wrong `x-grok-client-version` | Add/update version header |
| `400` with `tool_choice` error | Invalid OpenAI-compatible payload | Remove `tool_choice` or provide real tools |
| Refresh `invalid_grant` | Refresh token expired/rotated/revoked | Require `grok login` again |
| Refresh returns new refresh token | Rotation | Persist immediately |

### Logging Safety

Never log:

- `Authorization` headers
- `access_token`
- `refresh_token`
- `id_token`
- Raw `auth.json`
- Full callback URLs if they include authorization codes

Safe to log:

- HTTP status
- token expiry timestamps
- token length only
- JWT claims excluding token string, if needed
- model IDs
- request IDs
- usage token counts

## Example: Direct Composer Tool Call

```bash
SCOPE='https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828'
TOKEN=$(jq -r --arg scope "$SCOPE" '.[$scope].key' ~/.grok/auth.json)

curl -sS https://cli-chat-proxy.grok.com/v1/chat/completions \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'x-grok-client-version: 0.2.16' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "grok-composer-2.5-fast",
    "messages": [
      {
        "role": "user",
        "content": "테스트용으로 add 도구를 호출해서 2+3 계산해."
      }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "add",
          "description": "Add two numbers",
          "parameters": {
            "type": "object",
            "properties": {
              "a": {"type": "number"},
              "b": {"type": "number"}
            },
            "required": ["a", "b"]
          }
        }
      }
    ],
    "temperature": 0,
    "max_tokens": 256,
    "stream": false
  }'
```

Expected response shape:

```json
{
  "object": "chat.completion",
  "model": "grok-composer-2.5-fast",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "...",
        "tool_calls": [
          {
            "id": "call-...",
            "type": "function",
            "function": {
              "name": "add",
              "arguments": "{\"a\":2.0,\"b\":3.0}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ]
}
```

## Example: Direct Public xAI Responses API Call

```bash
SCOPE='https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828'
TOKEN=$(jq -r --arg scope "$SCOPE" '.[$scope].key' ~/.grok/auth.json)

curl -sS https://api.x.ai/v1/responses \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "grok-build-0.1",
    "input": "Reply exactly REFRESH_OK"
  }'
```

Expected final text extraction:

```bash
jq -r '.output[]? | select(.type=="message") | .content[]? | select(.type=="output_text") | .text'
```

Observed final text:

```text
REFRESH_OK
```

## Observed CLI Logs and Runtime Signals

The following strings and logs were observed while running the CLI with debug logging:

```text
starting new connection: https://cli-chat-proxy.grok.com/
Fetched remote settings from cli-chat-proxy
endpoint: https://cli-chat-proxy.grok.com/v1
resolved credentials model=grok-composer-2.5-fast auth_type=SessionToken
auth: configure_refresher already wired; ignoring
otel: upgraded credential provider to live AuthManager
```

The `initialize` response metadata included model state and available models:

```json
{
  "modelState": {
    "currentModelId": "grok-composer-2.5-fast",
    "availableModels": [
      {
        "modelId": "grok-composer-2.5-fast",
        "name": "Composer 2.5",
        "description": "Cursor's latest coding model"
      },
      {
        "modelId": "grok-build",
        "name": "Grok Build",
        "description": "Best for advanced coding tasks"
      }
    ]
  }
}
```

## Open Questions

The following areas were not fully validated:

1. Exact authorization-code token exchange request body used by `grok login`.
2. Device-code login request endpoints and polling behavior.
3. Streaming response format for `grok-composer-2.5-fast`.
4. Whether `grok-composer-2.5-fast` is intentionally supported for public direct API use or only as a CLI proxy model.
5. Whether the CLI proxy expects additional headers for some advanced operations.
6. Whether account subscription changes are enforced by access-token claims or server-side checks.
7. Whether refresh-token rotation is mandatory every time or conditional.
8. Whether the public `api.x.ai/v1` accepts `grok-composer-2.5-fast` directly under any model alias.
9. Whether `x-grok-client-version` must exactly match installed CLI version or just satisfy minimum version.
10. Whether `auth.json.lock` is actively used by the CLI for cross-process refresh locking.

## Practical Build Plan for `grok-oauth-api-proxy`

Recommended first implementation:

1. Build a local HTTP server with two upstream modes:
   - `/v1/chat/completions` -> `https://cli-chat-proxy.grok.com/v1/chat/completions`
   - `/v1/responses` -> `https://api.x.ai/v1/responses` or CLI proxy depending on requested model
2. Load credentials from `~/.grok/auth.json`.
3. Refresh when token expires within 5 minutes.
4. Persist rotated refresh tokens safely.
5. Add `x-grok-client-version` when forwarding to CLI proxy.
6. Forward request body mostly unchanged.
7. Redact secrets in logs.
8. Expose debug endpoints that show:
   - selected account email
   - principal type
   - token expiry
   - available local model defaults
   - no raw tokens
9. Add a smoke test for:
   - public `responses` call
   - Composer tool-call first turn
   - Composer tool-result second turn
   - refresh flow with redacted capture

## Appendix: Redacted Refresh Capture

The refresh test captured request and response details in a redacted JSON file.

Captured request:

```json
{
  "method": "POST",
  "url": "https://auth.x.ai/oauth2/token",
  "headers": {
    "Content-Type": "application/x-www-form-urlencoded"
  },
  "form": {
    "grant_type": "refresh_token",
    "client_id": "b1a00492-073a-47ea-816f-4c329264a828",
    "refresh_token": "<redacted:refresh_token>"
  },
  "previous_expires_at": "2026-06-02T12:15:52.272693Z"
}
```

Captured response:

```json
{
  "status": 200,
  "body_redacted": {
    "access_token": "<redacted:access_token:len=818>",
    "token_type": "Bearer",
    "expires_in": 21600,
    "refresh_token": "<redacted:refresh_token:len=86>",
    "scope": "openid profile email offline_access grok-cli:access api:access",
    "access_token_claims": {
      "iss": "https://auth.x.ai",
      "aud": "b1a00492-073a-47ea-816f-4c329264a828",
      "sub": "<user-id-uuid>",
      "scope": "openid profile email offline_access grok-cli:access api:access",
      "client_id": "b1a00492-073a-47ea-816f-4c329264a828",
      "exp_iso": "2026-06-02T12:26:49+00:00",
      "iat_iso": "2026-06-02T06:26:49+00:00"
    }
  }
}
```

## Appendix: Minimal Redaction Script

```python
import base64
import datetime
import json

def decode_jwt_claims(token: str) -> dict:
    parts = token.split(".")
    if len(parts) < 2:
        return {}
    payload = parts[1] + "=" * (-len(parts[1]) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))

def redact_token_response(body: dict) -> dict:
    out = dict(body)
    for key in ["access_token", "refresh_token", "id_token"]:
        if key in out and isinstance(out[key], str):
            out[key] = f"<redacted:{key}:len={len(out[key])}>"
    if isinstance(body.get("access_token"), str):
        claims = decode_jwt_claims(body["access_token"])
        safe_claims = {
            k: claims[k]
            for k in ["iss", "aud", "sub", "scope", "client_id", "exp", "iat"]
            if k in claims
        }
        for k in ["exp", "iat"]:
            if k in safe_claims:
                safe_claims[k + "_iso"] = datetime.datetime.fromtimestamp(
                    safe_claims[k],
                    datetime.timezone.utc,
                ).isoformat()
        out["access_token_claims"] = safe_claims
    return out
```

## Final Notes

The most important operational facts are:

- Grok CLI login is OIDC with PKCE.
- Access tokens are JWT-like and last about 6 hours.
- Refresh uses `grant_type=refresh_token` against `https://auth.x.ai/oauth2/token`.
- Refresh can return a rotated refresh token; persist it.
- The CLI proxy requires `x-grok-client-version`.
- Composer tool calling works through `chat/completions`.
- The public xAI `responses` API works with the same Grok user-session token when the token has `api:access`.
- This is account-bound user auth, not just a standalone API key.
