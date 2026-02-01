# Mail Magic Configuration Tutorial (MyOrg)

This guide walks through building a standalone configuration tree for the user `myorg` and the domain `myorg.com`. The finished layout adds a contact form template and a transactional welcome template that both reuse partials and embed the MyOrg logo inline so it is shipped as a CID attachment.

---

## 1. Prepare an external config workspace

Mail Magic loads configuration from the folder referenced by the `CONFIG_PATH` environment variable. Keeping your custom assets outside the application repository makes upgrades easier.

```bash
# run this next to the mail-magic checkout
mkdir -p ../myorg-config
export CONFIG_ROOT=$(realpath ../myorg-config)
```

Update your `.env` (or runtime environment) to point at the new workspace:

```
CONFIG_PATH=${CONFIG_ROOT}
DB_AUTO_RELOAD=1  # optional: hot‑reload init-data and templates
UPLOAD_PATH=./{domain}/uploads
```

From now on the tutorial assumes `${CONFIG_ROOT}` is the root of the custom config tree.

---

## 2. Create the base directory structure

```bash
mkdir -p \
  "$CONFIG_ROOT"/myorg.com/{form-template,tx-template} \
  "$CONFIG_ROOT"/myorg.com/form-template/{partials,assets} \
  "$CONFIG_ROOT"/myorg.com/tx-template/{partials,assets}
```

The resulting tree should look like this (logo placement shown for clarity — add the file in step 4):

```
myorg-config/
├── init-data.json
└── myorg.com/
    ├── form-template/
    │   ├── assets/
    │   ├── contact.njk
    │   └── partials/
    │       ├── footer.njk
    │       └── header.njk
    └── tx-template/
        ├── assets/
        │   └── logo.png
        ├── partials/
        │   ├── footer.njk
        │   └── header.njk
        └── welcome.njk
```

> **Tip:** If you want to share partials between templates, keep file names aligned (e.g. identical `header.njk` content under both `form-template/partials/` and `tx-template/partials/`).

> **Assets vs inline:** Any file you want to serve as an external URL must live under `myorg.com/assets/`. The template helper `asset('logo.png')` will become `http://localhost:3776/asset/myorg.com/logo.png` by default. You can change the base via `ASSET_PUBLIC_BASE` (or `API_URL`) and the path via `ASSET_ROUTE`. Use `asset('logo.png', true)` when you need the file embedded as a CID attachment instead.

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
			"email": "notifications@myorg.com"
		}
	],
	"domain": [
		{
			"domain_id": 10,
			"user_id": 10,
			"name": "myorg.com",
			"sender": "MyOrg Mailer <noreply@myorg.com>"
		}
	],
	"template": [
		{
			"template_id": 100,
			"user_id": 10,
			"domain_id": 10,
			"name": "welcome",
			"slug": "welcome",
			"locale": "",
			"filename": "welcome.njk",
			"sender": "support@myorg.com",
			"subject": "Welcome to MyOrg",
			"template": ""
		}
	],
	"form": [
		{
			"form_id": 100,
			"user_id": 10,
			"domain_id": 10,
			"idname": "contact",
			"filename": "contact.njk",
			"sender": "MyOrg Support <support@myorg.com>",
			"recipient": "contact@myorg.com",
			"subject": "New contact form submission"
		}
	]
}
```

- Generate the API token with `openssl rand -hex 16` (or any 32-character hex string).
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

Copy or design a square PNG logo and add it to both asset folders so the inline references resolve (Mail Magic resolves assets per template type):

```bash
cp path/to/myorg-logo.png "$CONFIG_ROOT"/myorg.com/tx-template/assets/logo.png
cp path/to/myorg-logo.png "$CONFIG_ROOT"/myorg.com/form-template/assets/logo.png
```

The inline flag (`true`) in `asset('logo.png', true)` tells Mail Magic to attach the image and rewrite the markup to `cid:logo.png` when messages are flattened.

---

## 5. Start Mail Magic and verify

1. Restart `mail-magic` (or run `npm run dev`) so it picks up the new `CONFIG_PATH`.
2. Confirm the bootstrap worked — the logs should mention importing user `myorg` and domain `myorg.com`.
3. Trigger a transactional email:
    ```bash
    curl -X POST http://localhost:3000/v1/tx/message \
      -H 'Content-Type: application/json' \
      -H 'X-API-Token: <your 32-char token>' \
      -d '{
        "user": "myorg",
        "domain": "myorg.com",
        "slug": "welcome",
        "to": "new.user@myorg.com",
        "variables": {"first_name": "Kai", "cta_url": "https://myorg.com/confirm"}
      }'
    ```
4. Trigger the contact form template the same way your frontend will post to `/v1/form/message` (Supply `form_id` or `idname` of `contact`). With `DB_AUTO_RELOAD=1`, editing the templates or assets is as simple as saving the file.

You now have a clean, self-contained configuration for MyOrg that inherits Mail Magic behaviour while keeping templates, partials, and assets under version control in a dedicated folder.
