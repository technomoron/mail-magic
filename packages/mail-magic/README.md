# @technomoron/mail-magic

Mail Magic is a TypeScript service for managing, templating, and delivering transactional emails and public form
submissions. It exposes a small REST API built on `@technomoron/api-server-base`, persists data with Sequelize/SQLite
(by default), and renders outbound messages with Nunjucks templates.

## Features

- Store and send transactional templates through a JSON API
- Store and deliver form submission templates through a public endpoint
- Optional recipient allowlist so public forms can target a named recipient without exposing email addresses
- Optional anti-abuse controls for public forms (rate limiting, attachment limits, CAPTCHA)
- Preprocess templates (includes + `asset(...)` rewrites) with `@technomoron/unyuck`
- Nodemailer transport configuration driven by environment variables
- Optional bundled admin UI (placeholder) served at `/` when enabled

## Install

```bash
npm install @technomoron/mail-magic
```

The package ships a `mail-magic` CLI.

## Run

Mail Magic loads:

- **Environment variables** (the `mail-magic` CLI supports `.env`)
- **Config directory** (`CONFIG_PATH`) containing `init-data.json`, templates, and assets

### 1. Create `.env`

Copy `.env-dist` and fill in the required bits:

```ini
# Required: used to HMAC API tokens before DB lookup (keep it stable).
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

### 2. Create a config directory

Minimum layout:

```text
data/
  init-data.json
  example.test/
    assets/
      images/logo.png
      files/banner.png
    tx-template/
      welcome.njk
      partials/
        header.njk
    form-template/
      contact.njk
      partials/
        fields.njk
```

Important: assets referenced via `asset('...')` must live under `<CONFIG_PATH>/<domain>/assets` (not under
`tx-template/` or `form-template/`).

### 3. Start the server

```bash
mail-magic --env ./.env
```

In this repository, development is optimized for `pnpm`:

```bash
pnpm install
pnpm -w --filter @technomoron/mail-magic dev
```

## Authentication (API Tokens)

Authenticated endpoints require:

```text
Authorization: Bearer apikey-<user_token>
```

Tokens are stored as `HMAC-SHA256(token, API_TOKEN_PEPPER)` in the database. You can seed a plaintext `token` in
`init-data.json`; it will be HMACed on import and the plaintext cleared.

## API Overview

All routes are mounted under `API_BASE_PATH` (default `/api`), so the full path is typically `/api/v1/...`.

| Auth | Method | Path                 | Description                                             |
| ---- | ------ | -------------------- | ------------------------------------------------------- |
| No   | GET    | `/v1/ping`           | Health check                                            |
| Yes  | POST   | `/v1/tx/template`    | Store/update a transactional template                   |
| Yes  | POST   | `/v1/tx/message`     | Render + deliver a stored transactional message         |
| Yes  | POST   | `/v1/form/template`  | Store/update a form template (returns `form_key`)       |
| Yes  | POST   | `/v1/form/recipient` | Upsert a recipient mapping (domain-wide or form-scoped) |
| No   | POST   | `/v1/form/message`   | Public form submission endpoint                         |
| Yes  | POST   | `/v1/assets`         | Upload domain or template-scoped assets                 |

Public assets are served from `ASSET_ROUTE` (default `/asset`). When `API_BASE_PATH` is in use, assets are also
reachable under `/api/asset/...` to match older `API_URL` defaults.

## Public Forms (`form_key`) and Recipient Allowlist

### Use `form_key` (via `_mm_form_key`) for public submissions

`POST /api/v1/form/template` returns a stable random ID (`data.form_key`, generated via nanoid). Public form submissions
use that key as `_mm_form_key` instead of `domain + formid`, because `domain + formid` can be ambiguous across locales
or multi-tenant setups.

### Public recipient selection without exposing email addresses

For cases like "contact a journalist", you can configure named recipients (allowlist) and let the public client select
by recipient `idname`:

1. Upsert recipient mapping (authenticated): `POST /api/v1/form/recipient` `{ domain, form_key?, idname, email, name? }`
2. Submit the public form (no auth): `POST /api/v1/form/message` `{ _mm_form_key, _mm_recipients, ...fields }`

Mappings are scoped by `(domain_id, form_key, idname)`:

- Use `form_key` to create a per-form allowlist.
- Omit `form_key` to create a domain-wide default allowlist.
- Form-scoped mappings override domain-wide mappings for the same `idname`.

### Recipient Overrides

The public endpoint does not accept client-provided `recipient` overrides. Use server-side recipient mappings and
`_mm_recipients` instead to avoid creating an open relay.

## Anti-Abuse Controls (Public Form Endpoint)

All knobs below are optional and default to "off" unless stated otherwise:

- Upload size limit per file: `UPLOAD_MAX` (bytes, enforced by the API server)
- Attachment count limit: `FORM_MAX_ATTACHMENTS` (`-1` unlimited, `0` disables attachments)
- Rate limiting: `FORM_RATE_LIMIT_WINDOW_SEC` + `FORM_RATE_LIMIT_MAX` (fixed window, in-memory, per client IP)
- Upload cleanup: `FORM_KEEP_UPLOADS` (when `false`, uploaded files are deleted after processing, even on failure)

### CAPTCHA (optional)

CAPTCHA verification is enabled when `FORM_CAPTCHA_SECRET` is set. You can require tokens globally with
`FORM_CAPTCHA_REQUIRED=true`, or per form with `captcha_required=true` on `POST /api/v1/form/template`.

Supported providers (`FORM_CAPTCHA_PROVIDER`):

- `turnstile` (Cloudflare)
- `hcaptcha`
- `recaptcha` (Google)

Token field names accepted by the server:

- `cf-turnstile-response`
- `h-captcha-response`
- `g-recaptcha-response`
- `captcha` (generic)

## Template Rendering Notes

### Autoescape (`AUTOESCAPE_HTML`)

Nunjucks HTML autoescape is enabled by default. You can toggle it via `AUTOESCAPE_HTML` (default: `true`).

Nunjucks also supports the `|safe` filter. Use it only for trusted content.

### Context Variables

Transactional templates receive:

- `_rcpt_email_`: current recipient
- `_vars_`: the `vars` object
- `_attachments_`: multipart field-name to filename map for uploaded attachments
- `_meta_`: request metadata (`client_ip`, `ip_chain`, `received_at`)

Form templates receive:

- `_fields_`: all submitted non-`_mm_*` fields. When `allowed_fields` is configured on the form, `_fields_` is filtered
  to that allowlist plus `email`/`name`/`first_name`/`last_name`.
- `_files_`: uploaded files
- `_attachments_`, `_vars_`, `_meta_`
- `_rcpt_email_`, `_rcpt_name_`, `_rcpt_idname_` (when using `_mm_recipients`)

### Assets (`asset('...')`)

In HTML templates, write:

- `asset('images/logo.png', true)` to embed as a CID attachment (`cid:images/logo.png`)
- `asset('files/banner.png')` to rewrite to a public URL under `ASSET_ROUTE`

Files must exist under `<CONFIG_PATH>/<domain>/assets`.

## Database Notes

- `DB_AUTO_RELOAD` watches `init-data.json` and refreshes templates/forms without a restart (development).
- `DB_FORCE_SYNC` drops and recreates tables on startup (dangerous).
- `DB_SYNC_ALTER` controls Sequelize `sync({ alter: ... })` on startup.

## Admin UI / Swagger

- `ADMIN_ENABLED=true` enables the optional admin UI and admin API module (if `@technomoron/mail-magic-admin` is
  installed).
- `SWAGGER_ENABLED=true` exposes Swagger/OpenAPI (path defaults to `/api/swagger`).

## Available Scripts (Repository)

- `pnpm -w --filter @technomoron/mail-magic dev` - start watch mode via `nodemon`
- `pnpm -w --filter @technomoron/mail-magic test` - run server tests
- `pnpm -w --filter @technomoron/mail-magic cleanbuild` - format + build
