# Form Security (Spam + Abuse Mitigation)

This document describes how to operate the public form submission endpoint safely.

## Public Endpoint Contract

Endpoint:

- `POST /api/v1/form/message` (no auth)

Required fields:

- `_mm_form_key` (string)

Optional routing fields:

- `_mm_recipients` (array of recipient `idname`s, or a comma-separated string)

Optional anti-abuse field:

- CAPTCHA token field (provider-native):
    - `cf-turnstile-response` (Turnstile)
    - `h-captcha-response` (hCaptcha)
    - `g-recaptcha-response` (reCAPTCHA)
    - `captcha` (generic/legacy)

Other fields:

- Any other fields are allowed and are exposed to templates as `_fields_`.

Non-system fields:

- Any other non-`_mm_*` fields are accepted as user fields and exposed to templates as `_fields_` verbatim.
- If the form template has `allowed_fields` configured, `_fields_` is filtered to that allowlist, plus these
  always-allowed fields: `email`, `name`, `first_name`, `last_name` (so Reply-To extraction still works).

Ignored legacy inputs:

- The server does not use `domain`, `formid`, `secret`, `recipient`, `recipient_idname`, `replyto` (or casing variants)
  for routing/auth. If they are submitted, they are treated as normal user fields (unless filtered by `allowed_fields`).

CAPTCHA token fields are accepted exactly as the providers submit them (no wrapper/rename).

Security goal:

- Treat `form_key` as the only public identifier needed to locate the form.
- Prevent “open relay” style abuse by allowing only recipient `idname`s (resolved server-side) instead of raw email
  addresses.
- Prevent client-controlled secrets and legacy fields from widening the attack surface.

## Recipient Allowlist and Reply-To

Mail Magic supports a recipient allowlist stored server-side via the authenticated endpoint:

- `POST /api/v1/form/recipient` (auth required)

Each recipient mapping has an `idname` and an email address. Mappings can be:

- Form-scoped (provide `form_key` when upserting the mapping)
- Domain-wide fallback (omit `form_key`)

Public submissions can then request routing by specifying:

- `_mm_recipients: ["alice", "desk"]`

If `_mm_recipients` is omitted, the form’s stored default recipient is used.

Reply-To:

- Reply-To behavior is configured per form (stored with the form template).

Fields on the form template:

- `replyto_from_fields` (boolean): when enabled, derive Reply-To from the submitted fields:
    - `email`
    - optional `name` or `first_name` + `last_name`
- `replyto_email` (string): forced reply-to mailbox used when extraction is disabled, or as a fallback when extraction
  fails.
- `allowed_fields` (string[]): optional allowlist of field names exposed to templates as `_fields_`. When set, any
  submitted fields not listed are ignored for template rendering (and for reply-to extraction).

Precedence:

- If `replyto_from_fields=true`: use extracted Reply-To if possible, otherwise fall back to `replyto_email` (if set).
- If `replyto_from_fields=false`: use `replyto_email` (if set).
- Otherwise: omit Reply-To.

## CAPTCHA

CAPTCHA is verified server-side.

Configuration (server environment):

- `FORM_CAPTCHA_PROVIDER`: `turnstile` | `hcaptcha` | `recaptcha`
- `FORM_CAPTCHA_SECRET`: provider secret key (enables verification when set)
- `FORM_CAPTCHA_REQUIRED`: when `true`, require CAPTCHA tokens for all form submissions

Per-form configuration (authenticated template upsert):

- `captcha_required=true` on `POST /api/v1/form/template` to require CAPTCHA for that form.

Client integration contract:

- CAPTCHA token fields are accepted exactly as the providers submit them. Do not wrap or rename them.

Examples:

```json
{ "_mm_form_key": "abc", "cf-turnstile-response": "<turnstile token>", "name": "Ada" }
```

```json
{ "_mm_form_key": "abc", "h-captcha-response": "<hcaptcha token>", "name": "Ada" }
```

```json
{ "_mm_form_key": "abc", "g-recaptcha-response": "<recaptcha token>", "name": "Ada" }
```

Operational notes:

- If CAPTCHA is required but `FORM_CAPTCHA_SECRET` is missing, the server returns `500`.
- If CAPTCHA is required and the provider token field is missing, the server returns `403`.
- If verification fails, the server returns `403`.

## Rate Limiting

Mail Magic has an optional in-memory fixed-window limiter on the public form endpoint:

- `FORM_RATE_LIMIT_WINDOW_SEC`: window size in seconds
- `FORM_RATE_LIMIT_MAX`: max requests per client IP per window (`0` disables rate limiting)

Important limitations:

- It is per-process memory. If you run multiple instances, limits do not aggregate.
- Client IP is derived from request metadata; if you are not behind a trusted reverse proxy that normalizes headers,
  clients can spoof IP-related headers.

Recommendation:

- Keep the built-in limiter as a “last line of defense”.
- Enforce a real limiter at the edge (CDN/WAF/reverse proxy) for stronger protection.

## Attachments and Upload Limits

Attachments are a common abuse vector.

Controls:

- `UPLOAD_MAX` (bytes): max size per uploaded file (enforced by the server’s multipart handling)
- `FORM_MAX_ATTACHMENTS`: max number of uploaded files (`-1` unlimited, `0` disables attachments)
- `FORM_KEEP_UPLOADS`: when `false`, uploaded files are deleted after processing (best-effort), even on failures

Recommendations:

- If you do not need attachments, set `FORM_MAX_ATTACHMENTS=0`.
- Set a conservative `UPLOAD_MAX` (and enforce matching limits at your reverse proxy).
- Monitor disk usage for your upload staging directory.

## Reverse Proxy / Edge Hardening

You should run the server behind a reverse proxy (or CDN) and apply:

- Request body size limits.
- Rate limits per IP.
- Bot protection / WAF rules on `POST /api/v1/form/message`.
- Header normalization: strip client-provided `X-Forwarded-For` and set it yourself.

Example Nginx ideas (sketch, not drop-in):

```nginx
# Limit body size (align with UPLOAD_MAX and your attachment policy).
client_max_body_size 2m;

# Basic rate limiting.
limit_req_zone $binary_remote_addr zone=form_rate:10m rate=10r/m;

location /api/v1/form/message {
  limit_req zone=form_rate burst=20 nodelay;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_pass http://127.0.0.1:3776;
}
```

## Treat `form_key` as Sensitive

`form_key` is the public identifier for a form. If it is leaked, attackers can submit spam to that form.

Recommendations:

- Use long, random `form_key`s (Mail Magic generates them automatically when creating/upserting a form template).
- Rotate `form_key` if you suspect it has leaked.
- Don’t publish `form_key` in places you cannot control (logs, public repos, client-side error reporting).
