# @technomoron/mail-magic

Mail Magic is a small TypeScript HTTP service that:

- stores transactional email templates and sends transactional messages (authenticated API)
- stores “contact form” templates and accepts public form submissions (unauthenticated endpoint)
- renders mail with Nunjucks, and delivers via Nodemailer

This README is intended to be “enough to run and operate the service”. For exact request/response shapes and every
endpoint, use the OpenAPI spec described in **Swagger / OpenAPI** below.

## Contents

- What You Get
- Install
- Quick Start
- Concepts
- Configuration
- Swagger / OpenAPI
- API Usage (Examples)
- Public Form Endpoint Contract
- Assets
- Security Notes
- Development (Repo)

## What You Get

- REST API built on `@technomoron/api-server-base`
- SQLite + Sequelize persistence by default (configurable)
- Nunjucks templating with optional HTML autoescape (`AUTOESCAPE_HTML=true` by default)
- Config tree on disk (`CONFIG_PATH`) for per-domain templates and assets
- Recipient allowlist so public forms can route to named recipients without exposing emails
- Optional anti-abuse controls on the public form endpoint (rate limiting, attachment limits, CAPTCHA)

## Install

```bash
npm install @technomoron/mail-magic
```

The package ships a `mail-magic` CLI that loads a `.env` file and starts the server.

## Quick Start

### 1. Create a `.env`

Start from the repo’s `.env-dist` and set at least:

```ini
# REQUIRED. Keep stable: used to HMAC API tokens before DB lookup.
API_TOKEN_PEPPER=change-me-please-use-a-long-random-string

CONFIG_PATH=./data

API_HOST=127.0.0.1
API_PORT=3776
API_BASE_PATH=/api
API_URL=http://127.0.0.1:3776

SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_TLS_REJECT=false
```

### 2. Create a minimal config directory

`CONFIG_PATH` points at a directory containing `init-data.json` plus per-domain subfolders:

```text
data/
  init-data.json
  example.test/
    assets/
      images/logo.png
    tx-template/
      welcome.njk
    form-template/
      contact.njk
```

Assets referenced via `asset('...')` must live under:

`<CONFIG_PATH>/<domain>/assets/...`

### 3. Start the server

```bash
mail-magic --env ./.env
```

## Concepts

### Domain-first config layout

Mail Magic treats each domain as a root for templates and assets on disk:

- Transactional templates: `<CONFIG_PATH>/<domain>/tx-template/...`
- Form templates: `<CONFIG_PATH>/<domain>/form-template/...`
- Public assets: `<CONFIG_PATH>/<domain>/assets/...`

### Transactional vs form messages

- Transactional:
    - authenticated endpoints
    - you choose recipient email(s) in the send request
    - templates can use `_vars_` and `_rcpt_email_`
- Form:
    - authenticated endpoint to store/update the form template and configuration
    - unauthenticated endpoint to submit the form
    - public submissions are identified by a random `form_key`

### `form_key` (public identifier)

`POST /api/v1/form/template` returns a stable random `form_key`. Public submissions use that key as `_mm_form_key`.

Treat `form_key` as sensitive: anyone who has it can submit to that form.

### Recipient allowlist

For “choose a recipient” forms, do not accept user-supplied emails. Instead:

1. Configure recipients server-side with `POST /api/v1/form/recipient` (authenticated).
2. In the public request, pass `_mm_recipients` containing recipient `idname`s.

The server resolves those `idname`s to real email addresses using the allowlist.

## Configuration

Mail Magic is configured via environment variables plus the `CONFIG_PATH` directory.

The full set of environment variables is documented in the repository’s `.env-dist`.

Commonly used variables:

- `API_HOST`, `API_PORT`, `API_URL`
- `API_BASE_PATH` (default `/api`)
- `CONFIG_PATH` (default `./data/`)
- `ASSET_ROUTE` (default `/asset`)
- `ASSET_PUBLIC_BASE` (optional public base URL for assets)
- `AUTOESCAPE_HTML` (default `true`)
- `UPLOAD_PATH`, `UPLOAD_MAX` (multipart uploads)
- Public form anti-abuse:
    - `FORM_RATE_LIMIT_WINDOW_SEC`, `FORM_RATE_LIMIT_MAX`
    - `FORM_MAX_ATTACHMENTS`, `FORM_KEEP_UPLOADS`
    - `FORM_CAPTCHA_PROVIDER`, `FORM_CAPTCHA_SECRET`, `FORM_CAPTCHA_REQUIRED`
- Swagger/OpenAPI:
    - `SWAGGER_ENABLED`, `SWAGGER_PATH`

## Swagger / OpenAPI

Mail Magic ships an OpenAPI JSON spec and can expose it at runtime.

Packaged spec (on disk):

- `node_modules/@technomoron/mail-magic/docs/swagger/openapi.json`

Runtime spec endpoint:

- set `SWAGGER_ENABLED=true`
- optionally set `SWAGGER_PATH` (defaults to `<API_BASE_PATH>/swagger`, typically `/api/swagger`)
- fetch the JSON from that endpoint and feed it to Swagger UI / Postman / Insomnia

This spec is the canonical reference for:

- the exact route list
- request/response bodies
- status codes and error shapes

## API Usage (Examples)

All authenticated routes require:

```text
Authorization: Bearer apikey-<user_token>
```

Tokens are stored as `HMAC-SHA256(token, API_TOKEN_PEPPER)` in the DB. You can seed a plaintext `token` in
`init-data.json`; it will be HMACed on import and the plaintext cleared.

### Transactional: store template (authenticated)

```bash
curl -X POST http://localhost:3776/api/v1/tx/template \
  -H "Authorization: Bearer apikey-<token>" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "example.test",
    "name": "welcome",
    "sender": "Example <noreply@example.test>",
    "subject": "Welcome",
    "locale": "en",
    "template": "<p>Hi {{ _vars_.first_name }}</p>"
  }'
```

### Transactional: send message (authenticated)

```bash
curl -X POST http://localhost:3776/api/v1/tx/message \
  -H "Authorization: Bearer apikey-<token>" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "example.test",
    "name": "welcome",
    "locale": "en",
    "rcpt": ["person@example.test"],
    "vars": { "first_name": "Ada" }
  }'
```

### Forms: store form template (authenticated)

This returns `data.form_key` which is used by the public endpoint.

```bash
curl -X POST http://localhost:3776/api/v1/form/template \
  -H "Authorization: Bearer apikey-<token>" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "example.test",
    "idname": "contact",
    "sender": "Example Forms <forms@example.test>",
    "recipient": "owner@example.test",
    "subject": "New contact form submission",
    "locale": "en",
    "template": "<p>Contact from {{ _fields_.name }} ({{ _fields_.email }})</p>"
  }'
```

### Forms: submit (public endpoint, no auth)

```bash
curl -X POST http://localhost:3776/api/v1/form/message \
  -H "Content-Type: application/json" \
  -d '{
    "_mm_form_key": "<form_key from the template response>",
    "name": "Kai",
    "email": "kai@example.test",
    "message": "Hello"
  }'
```

## Public Form Endpoint Contract

Endpoint:

- `POST /api/v1/form/message` (no auth)

Required system fields:

- `_mm_form_key` (string)

Optional system fields:

- `_mm_locale` (string)
- `_mm_recipients` (string[] or comma-separated string)

CAPTCHA token fields (accepted as-is, provider-native):

- `cf-turnstile-response`
- `h-captcha-response`
- `g-recaptcha-response`
- `captcha`

Attachments (multipart):

- attachment field names must start with `_mm_file` (example: `_mm_file1`, `_mm_file2`)
- the server enforces `FORM_MAX_ATTACHMENTS` (and `UPLOAD_MAX` per file)

All other non-`_mm_*` fields are treated as user fields and are exposed to templates as `_fields_` (optionally filtered
by the form template’s `allowed_fields` setting).

## Assets

Templates may reference assets with `asset('path')`:

- `asset('images/logo.png')` rewrites to a public URL under `ASSET_ROUTE` (default `/asset`)
- `asset('images/logo.png', true)` embeds as a CID attachment

All assets must live under:

`<CONFIG_PATH>/<domain>/assets/...`

## Security Notes

If you expose `POST /api/v1/form/message` publicly, read:

- `docs/form-security.md` (in this package) for the contract and operational hardening guidance

At a minimum:

- treat `form_key` as sensitive
- keep recipient routing server-side (`_mm_recipients` idnames only)
- set conservative `UPLOAD_MAX` and `FORM_MAX_ATTACHMENTS` if you enable uploads
- use a real edge rate limiter/WAF in front of the public endpoint

## Development (Repo)

In this repository, `pnpm` is the preferred package manager:

```bash
pnpm install
pnpm -w --filter @technomoron/mail-magic dev
pnpm -w --filter @technomoron/mail-magic test
pnpm -w --filter @technomoron/mail-magic cleanbuild
```

Documentation:

- `packages/mail-magic/docs/tutorial.md` is a hands-on config walkthrough.
- `packages/mail-magic/docs/form-security.md` covers the public form endpoint contract and recommended mitigations.
