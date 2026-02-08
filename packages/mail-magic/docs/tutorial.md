# Mail Magic Configuration Tutorial (MyOrg)

This guide walks through building a standalone configuration tree for the user `myorg` and the domain `myorg.com`. The
finished layout adds a contact form template and a transactional welcome template that both reuse partials and embed the
MyOrg logo inline so it is shipped as a CID attachment.

---

## 1. Prepare an external config workspace

Mail Magic loads configuration from the folder referenced by the `CONFIG_PATH` environment variable. Keeping your custom
assets outside the application repository makes upgrades easier.

```bash
# run this next to the mail-magic checkout
mkdir -p ../myorg-config
export CONFIG_ROOT=$(realpath ../myorg-config)
```

Update your `.env` (or runtime environment) to point at the new workspace:

```
API_TOKEN_PEPPER=<generate-a-long-random-string>
CONFIG_PATH=${CONFIG_ROOT}
DB_AUTO_RELOAD=1  # optional: hot-reload init-data and templates
UPLOAD_PATH=./{domain}/uploads
```

From now on the tutorial assumes `${CONFIG_ROOT}` is the root of the custom config tree.

---

## 2. Create the base directory structure

```bash
mkdir -p \
  "$CONFIG_ROOT"/myorg.com/assets \
  "$CONFIG_ROOT"/myorg.com/form-template/partials \
  "$CONFIG_ROOT"/myorg.com/tx-template/partials
```

The resulting tree should look like this (logo placement shown for clarity — add the file in step 4):

```
myorg-config/
├── init-data.json
└── myorg.com/
    ├── assets/
    │   └── logo.png
    ├── form-template/
    │   ├── contact.njk
    │   └── partials/
    │       ├── footer.njk
    │       └── header.njk
    └── tx-template/
        ├── partials/
        │   ├── footer.njk
        │   └── header.njk
        └── welcome.njk
```

> **Tip:** If you want to share partials between templates, keep file names aligned (e.g. identical `header.njk` content
> under both `form-template/partials/` and `tx-template/partials/`).

> **Assets vs inline:** Any file referenced via `asset('...')` must live under `myorg.com/assets/`. The helper
> `asset('logo.png')` will become `http://localhost:3776/asset/myorg.com/logo.png` by default. You can change the base
> via `ASSET_PUBLIC_BASE` (or `API_URL`) and the route via `ASSET_ROUTE`. Use `asset('logo.png', true)` when you need
> the file embedded as a CID attachment instead.

---

## 3. Seed users, domains, and templates with `init-data.json`

Create `${CONFIG_ROOT}/init-data.json` so the service can bootstrap the MyOrg user, domain, and template metadata:

```json
{
	"user": [
		{
			"user_id": 10,
			"idname": "myorg",
			"token": "<generate-a-32-char-hex-token>",
			"name": "MyOrg",
			"email": "notifications@myorg.com",
			"domain": 10,
			"locale": "en"
		}
	],
	"domain": [
		{
			"domain_id": 10,
			"user_id": 10,
			"name": "myorg.com",
			"sender": "MyOrg Mailer <noreply@myorg.com>",
			"locale": "en",
			"is_default": true
		}
	],
	"template": [
		{
			"template_id": 100,
			"user_id": 10,
			"domain_id": 10,
			"name": "welcome",
			"locale": "en",
			"filename": "",
			"sender": "support@myorg.com",
			"subject": "Welcome to MyOrg",
			"template": "",
			"slug": ""
		}
	],
	"form": [
		{
			"form_id": 100,
			"form_key": "<generate-a-random-form-key>",
			"user_id": 10,
			"domain_id": 10,
			"locale": "en",
			"idname": "contact",
			"filename": "",
			"sender": "MyOrg Support <support@myorg.com>",
			"recipient": "contact@myorg.com",
			"subject": "New contact form submission",
			"secret": "s3cret",
			"slug": ""
		}
	]
}
```

- Generate the API token with `openssl rand -hex 16` (or any 32-character hex string).
- `API_TOKEN_PEPPER` must be set when starting the server. Tokens are stored as `HMAC-SHA256(token, API_TOKEN_PEPPER)`
  in the database, so the plaintext `token` is cleared after import.
- Leave `template` empty; Mail Magic will populate it with the flattened HTML the first time it processes the files.
- Set `DB_AUTO_RELOAD=1` (see step 1) if you want the service to re-import whenever `init-data.json` changes.

---

## 4. Author shared partials and templates

### 4.1 Transactional email partials (`tx-template/partials`)

`$CONFIG_ROOT/myorg.com/tx-template/partials/header.njk`

```njk
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#102347;color:#ffffff;padding:24px 0;font-family:'Segoe UI',Tahoma,sans-serif;">
  <tr>
    <td align="center">
      <img src="asset('logo.png', true)" alt="MyOrg" width="96" height="96" style="display:block;border:none;border-radius:50%;box-shadow:0 4px 14px rgba(0,0,0,0.18);" />
      <h1 style="margin:16px 0 0;font-size:24px;letter-spacing:0.08em;text-transform:uppercase;">MyOrg</h1>
    </td>
  </tr>
</table>
```

`$CONFIG_ROOT/myorg.com/tx-template/partials/footer.njk`

```njk
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;color:#6b7280;padding:24px 0;font-family:'Segoe UI',Tahoma,sans-serif;font-size:12px;">
  <tr>
    <td align="center">
      <p style="margin:0;">You are receiving this email because you created a MyOrg account.</p>
      <p style="margin:8px 0 0;">MyOrg, 123 Demo Street, Oslo</p>
    </td>
  </tr>
</table>
```

### 4.2 Transactional welcome template (`tx-template/welcome.njk`)

`$CONFIG_ROOT/myorg.com/tx-template/welcome.njk`

```njk
{% include 'partials/header.njk' %}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:32px 0;font-family:'Segoe UI',Tahoma,sans-serif;color:#1f2937;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:92%;text-align:left;">
        <tr>
          <td style="padding:0 0 24px;font-size:18px;font-weight:600;">Hi {{ _vars_.first_name or _rcpt_email_ }},</td>
        </tr>
        <tr>
          <td style="padding:0 0 16px;font-size:15px;line-height:1.6;">
            <p style="margin:0 0 12px;">Welcome to MyOrg! Your workspace <strong>{{ _vars_.workspace or 'Starter Plan' }}</strong> is ready.</p>
            <p style="margin:0;">Use the button below to confirm your email and finish the setup.</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:12px 0 28px;">
            <a href="{{ _vars_.cta_url or '#' }}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:6px;font-size:15px;">Confirm email</a>
          </td>
        </tr>
        <tr>
          <td style="font-size:13px;line-height:1.5;color:#6b7280;">
            <p style="margin:0 0 8px;">If you did not sign up for MyOrg, you can ignore this email.</p>
            <p style="margin:0;">Need help? Reply to this message or visit {{ _vars_.support_url or 'https://myorg.com/support' }}.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

{% include 'partials/footer.njk' %}
```

### 4.3 Contact form partials (`form-template/partials`)

`$CONFIG_ROOT/myorg.com/form-template/partials/header.njk`

```njk
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#102347;color:#ffffff;padding:18px 0;font-family:Arial,sans-serif;">
  <tr>
    <td align="center" style="font-size:20px;font-weight:600;">New MyOrg contact form submission</td>
  </tr>
</table>
```

`$CONFIG_ROOT/myorg.com/form-template/partials/footer.njk`

```njk
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;color:#6b7280;padding:16px 0;font-family:Arial,sans-serif;font-size:12px;">
  <tr>
    <td align="center">
      <p style="margin:0;">Delivered by Mail Magic for MyOrg.</p>
    </td>
  </tr>
</table>
```

### 4.4 Contact form template (`form-template/contact.njk`)

`$CONFIG_ROOT/myorg.com/form-template/contact.njk`

```njk
{% include 'partials/header.njk' %}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:24px 0;font-family:Arial,sans-serif;color:#111827;">
  <tr>
    <td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:94%;text-align:left;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
        <tr>
          <td style="padding:20px 24px;font-size:16px;font-weight:600;background:#f9fafb;">Submitted fields</td>
        </tr>
        <tr>
          <td style="padding:16px 24px;">
            {% if _fields_ %}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
                {% for field, value in _fields_ %}
                <tr>
                  <td style="padding:8px 0;color:#6b7280;width:180px;">{{ field | replace('_', ' ') | title }}</td>
                  <td style="padding:8px 0;color:#111827;">{{ value }}</td>
                </tr>
                {% endfor %}
              </table>
            {% else %}
              <p>No form fields were included.</p>
            {% endif %}
          </td>
        </tr>
        {% if _meta_ %}
        <tr>
          <td style="padding:16px 24px;background:#f9fafb;color:#4b5563;font-size:12px;">
            <strong>Sender IP:</strong> {{ _meta_.client_ip | default('unknown') }} ·
            <strong>Received at:</strong> {{ _meta_.received_at | default(now().iso8601()) }}
          </td>
        </tr>
        {% endif %}
      </table>
    </td>
  </tr>
</table>

{% include 'partials/footer.njk' %}
```

### 4.5 Provide the logo asset

Copy or design a square PNG logo and add it under the domain assets folder so the inline references resolve:

```bash
cp path/to/myorg-logo.png "$CONFIG_ROOT"/myorg.com/assets/logo.png
```

The inline flag (`true`) in `asset('logo.png', true)` tells Mail Magic to attach the image and rewrite the markup to
`cid:logo.png` when messages are flattened.

---

## 5. Start Mail Magic and verify

1. Restart `mail-magic` (or run `pnpm -w --filter @technomoron/mail-magic dev`) so it picks up the new `CONFIG_PATH`.
2. Confirm the bootstrap worked — the logs should mention importing user `myorg` and domain `myorg.com`.
3. Verify the server is reachable:
    ```bash
    curl http://localhost:3776/api/v1/ping
    ```
4. Trigger a transactional email (authenticated):
    ```bash
    curl -X POST http://localhost:3776/api/v1/tx/message \
      -H 'Content-Type: application/json' \
      -H 'Authorization: Bearer apikey-<your token>' \
      -d '{
        "domain": "myorg.com",
        "name": "welcome",
        "locale": "en",
        "rcpt": "new.user@myorg.com",
        "vars": {
          "first_name": "Kai",
          "cta_url": "https://myorg.com/confirm",
          "support_url": "https://myorg.com/support"
        }
      }'
    ```
5. Submit the contact form the same way your frontend will post (public endpoint). This endpoint requires
   `_mm_form_key`:
    ```bash
    curl -X POST http://localhost:3776/api/v1/form/message \
      -H 'Content-Type: application/json' \
      -d '{
        "_mm_form_key": "<your form_key>",
        "name": "Kai",
        "email": "kai@myorg.com",
        "message": "Hello from the contact form"
      }'
    ```

With `DB_AUTO_RELOAD=1`, editing templates or assets is as simple as saving the file.

You now have a clean, self-contained configuration for MyOrg that inherits Mail Magic behaviour while keeping templates,
partials, and assets under version control in a dedicated folder.

---

## 6. Optional: Recipient allowlist for public forms (`_mm_recipients`)

If you have a public form where the frontend must select a recipient (for example "send a message to a journalist"),
avoid shipping raw email addresses client-side.

Instead:

1. Configure recipients (authenticated) with `POST /api/v1/form/recipient`.
2. Submit public forms with `_mm_recipients`.

Example (domain-wide mapping):

```bash
curl -X POST http://localhost:3776/api/v1/form/recipient \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer apikey-<your token>' \
  -d '{
    "domain": "myorg.com",
    "idname": "desk",
    "email": "News Desk <desk@myorg.com>"
  }'
```

Example (public submit):

```bash
curl -X POST http://localhost:3776/api/v1/form/message \
  -H 'Content-Type: application/json' \
  -d '{
    "_mm_form_key": "<your form_key>",
    "_mm_recipients": ["desk"],
    "name": "Kai",
    "email": "kai@myorg.com",
    "message": "Hello"
  }'
```

Mappings can also be scoped to a specific form by supplying `form_key` on the `/form/recipient` upsert. Form-scoped
mappings override domain-wide mappings for the same `idname`.

---

## 7. Optional: CAPTCHA and rate limiting for public forms

If the public form endpoint is a spam/volume target, enable one or more of these:

- `FORM_RATE_LIMIT_WINDOW_SEC` + `FORM_RATE_LIMIT_MAX`
- `FORM_MAX_ATTACHMENTS` and `UPLOAD_MAX`
- CAPTCHA: set `FORM_CAPTCHA_SECRET` + `FORM_CAPTCHA_PROVIDER`

Per form, you can also set `captcha_required=true` when storing/updating the form template via the API
(`POST /api/v1/form/template`).
