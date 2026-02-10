# Templates (Hierarchy, Includes, Assets)

This guide explains how Mail Magic templates are structured on disk and how “hierarchies” (parent templates + includes)
and assets (public URLs vs inline CID attachments) work.

Mail Magic uses:

- Nunjucks syntax inside templates (`.njk`) for variables/logic and `extends`/`include`.
- A preprocessing step that *flattens* template hierarchies and rewrites `asset('...')` references.

## Directory Layout

Templates and assets are loaded from the external config tree rooted at `CONFIG_PATH`.

For each sending domain you typically have:

```
${CONFIG_PATH}/
└── example.com/
    ├── assets/
    │   ├── images/
    │   │   └── logo.png
    │   └── files/
    │       └── banner.png
    ├── tx-template/
    │   ├── base.njk
    │   ├── welcome.njk
    │   └── partials/
    │       └── header.njk
    └── form-template/
        ├── base.njk
        ├── contact.njk
        └── partials/
            └── fields.njk
```

Notes:

- Transactional templates live under `${domain}/tx-template/`.
- Form templates live under `${domain}/form-template/`.
- Shared static files referenced with `asset('...')` live under `${domain}/assets/`.

## Locales (Template Behavior, APIs, Paths)

Locales affect:

- Which template record is selected by APIs (transactional send, asset uploads).
- Where Mail Magic expects the `.njk` file to live on disk when importing from `CONFIG_PATH`.

Locales do not affect:

- Public asset URLs (assets are served at `/${ASSET_ROUTE}/${domain}/...` with no locale segment).

### Filesystem layout for locale variants

If you have multiple locale versions of the same template/form, place them under a locale subdirectory:

```
${CONFIG_PATH}/example.com/tx-template/en/welcome.njk
${CONFIG_PATH}/example.com/tx-template/fr/welcome.njk

${CONFIG_PATH}/example.com/form-template/en/contact.njk
${CONFIG_PATH}/example.com/form-template/fr/contact.njk
```

Includes/extends are resolved relative to the current template root. For example, inside
`tx-template/fr/welcome.njk`, this will load `tx-template/fr/base.njk`:

```njk
{% extends "base.njk" %}
```

If you want to share a base across locales, you can still do it, but you need to reference it by a path that exists in
your config tree (for example, copy the base into each locale directory or structure your directories accordingly).

### Locale and generated template paths (import from CONFIG_PATH)

When template records are created/imported without an explicit `filename`, Mail Magic generates a path that includes the
locale (when non-empty):

- Transactional template: `${domainSlug}/tx-template/${localeSlug}/${name}.njk`
- Form template: `${domainSlug}/form-template/${localeSlug}/${idname}.njk`

Important nuance:

- If you set `filename` yourself in the record (for example in `init-data.json`), Mail Magic will not automatically
  inject the locale directory for you. If you want locale-specific paths in that case, include the locale in the
  `filename` value you provide.

### Transactional API: selecting the right locale

When you send a transactional message (`/v1/tx/message`), you can pass `locale`.

Lookup order is:

1. Match `name + domain + locale` (the request locale)
2. Match `name + domain + deflocale` (server default locale when set; typically empty otherwise)
3. Match `name + domain` (any locale)

Practical implications:

- If you only have one locale version, you can omit `locale`.
- If you have multiple locale versions, always pass `locale` to avoid “any locale” fallback selecting the wrong one.

Example:

```json
{
  "name": "welcome",
  "domain": "example.com",
  "locale": "fr",
  "rcpt": "user@example.com",
  "vars": { "name": "Jean" }
}
```

### Form API: locale vs form_key

Forms are ultimately selected by `form_key` on public submission (`/v1/form/message`).

- `POST /v1/form/template` stores the form template record under `(domain, idname, locale)` and returns a `form_key`.
- If you create `contact` in `en` and `fr`, you will get two different `form_key` values.
- Public form submissions use `_mm_form_key` to pick the form; `_mm_locale` is exposed to the template as a value (and is
  used elsewhere such as recipient-resolution inputs), but it does not override which form template is selected.

### Asset upload API: locale matters when targeting template directories

`POST /v1/assets` can upload files either:

- Into the domain-wide assets directory (`${domain}/assets/...`) when `templateType` is not provided.
- Into a specific template directory (tx/form) when `templateType` and `template` are provided.

When targeting a template directory, you can also provide `locale` so Mail Magic chooses the correct localized template
record to locate the directory.

If you omit `locale` and you have multiple locale variants, the server may fall back to a different locale (or “any
locale”) depending on what records exist.

## How Hierarchy Works (Parent Templates + Blocks)

Use standard Nunjucks inheritance:

`tx-template/base.njk`

```njk
<!doctype html>
<html>
  <head>
    <title>{{ title }}</title>
  </head>
  <body>
    {% block body %}{% endblock %}
  </body>
</html>
```

`tx-template/partials/header.njk`

```njk
<h1>{{ heading }}</h1>
```

`tx-template/welcome.njk`

```njk
{% extends "base.njk" %}

{% block body %}
  {% include "partials/header.njk" %}

  <p>Hello {{ name }}</p>

  <!-- Inline (CID) asset -->
  <img src="asset('images/logo.png', true)" alt="logo" />

  <!-- Linked (public URL) asset -->
  <img src="asset('files/banner.png')" alt="banner" />
{% endblock %}
```

## Includes

Includes are also standard Nunjucks:

```njk
{% include "partials/footer.njk" %}
```

Recommendation:

- Keep includes simple and “pure” (no side effects), and pass data via variables in the render context.
- Prefer a `partials/` folder and consistent naming across `tx-template/` and `form-template/`.

## Assets: Public Links vs Inline (CID)

Mail Magic supports a helper-like syntax inside HTML attributes:

- `asset('path/to/file.ext')` for a public URL
- `asset('path/to/file.ext', true)` for an inline CID asset

The referenced file is resolved under:

`${CONFIG_PATH}/${domain}/assets/path/to/file.ext`

### Linked assets (public URL)

Example:

```html
<img src="asset('files/banner.png')" />
```

During preprocessing/import this becomes a URL like:

```
${ASSET_PUBLIC_BASE-or-API_URL}${ASSET_ROUTE}/${domain}/files/banner.png
```

The asset is *not* embedded in the HTML; it will be fetched by the email client.

### Inline assets (CID)

Example:

```html
<img src="asset('images/logo.png', true)" />
```

During preprocessing/import this becomes:

```html
<img src="cid:images_logo.png" />
```

And the template record will store an entry like:

```json
{ "filename": "images/logo.png", "path": "/abs/path/to/.../assets/images/logo.png", "cid": "images_logo.png" }
```

That `cid` is what email clients use to render the embedded image reliably.

CID rules/notes:

- Mail Magic normalizes CIDs to avoid `/` and other characters that cause mail client issues.
- The CID is derived from the asset path (so keep asset paths stable if you want stable CIDs).

## “Attached assets” vs “Attachments”

There are two different things people call “attachments”:

1. Template assets (from `asset('...')`)
   - These are discovered during preprocessing/import and stored on the template/form record as `files`.
   - Inline assets (the `true` flag) are attached with a `contentId` so `cid:...` works.

2. Runtime attachments (uploaded with the send request)
   - Transactional send supports uploading files with the API call.
   - Form submissions support uploading files with `_mm_file*`.

### Transactional: what gets attached

When sending a transactional template, Mail Magic attaches:

- All template assets discovered during preprocessing/import (both inline and linked).
- Any runtime files uploaded with the send request.

Practical implication:

- If you reference a file with `asset('files/banner.png')`, the HTML will link to the public URL, but the file will also
  be attached as a regular attachment (no CID).

### Forms: what gets attached

When sending a form email, Mail Magic attaches:

- Inline template assets only (`asset('...', true)`), because those need to be embedded for the HTML to render.
- Runtime `_mm_file*` uploads.

Linked template assets are kept as URLs and are not attached for forms.

## Template Variables (What You Can Render)

### Transactional templates

The `/v1/tx/message` endpoint renders the stored template with a context containing:

- Your provided `vars` (merged at top level), e.g. `{{ name }}`, `{{ title }}`
- `_rcpt_email_`: current recipient email
- `_attachments_`: map of uploaded field name to original file name (for runtime uploads)
- `_vars_`: the original `vars` object
- `_meta_`: request metadata (client IP, user agent, etc)

Example snippet:

```njk
<p>Hi {{ name }} ({{ _rcpt_email_ }})</p>
<p>Uploaded: {{ _attachments_.file1 }}</p>
```

### Form templates

Form templates are rendered with:

- `_fields_`: all non-system submitted fields (optionally filtered by `allowed_fields`)
- `_mm_form_key`, `_mm_locale`, `_mm_recipients`: system fields from the public submission
- `_attachments_`: map of uploaded field name to original file name
- `_files_`: uploaded file objects
- `_meta_`: request metadata

Example snippet:

```njk
<p>Name: {{ _fields_.name }}</p>
<p>Email: {{ _fields_.email }}</p>
<p>Form key: {{ _mm_form_key }}</p>
```

## Preprocessing/Import: The Important Constraint

Template *hierarchies* (`extends`/`include`) and `asset('...')` rewriting happen when Mail Magic loads templates from the
config filesystem and preprocesses them into a single stored template string.

That means:

- If you store a template directly via the API (`/v1/tx/template` or `/v1/form/template`), it is stored “as-is”.
- API-stored templates are rendered with `renderString()` (no filesystem loader), so `extends`/`include` can’t load other
  files, and `asset('...')` won’t be rewritten.

If you want parent templates/includes/assets:

- Put templates and assets in the config tree under `CONFIG_PATH`, and import them (commonly by seeding records via
  `init-data.json` with an empty `template` field so Mail Magic populates it from the `.njk` file).

## Common Pitfalls

- Asset files must live under `${domain}/assets/` for `asset('...')` to resolve.
- `asset('...', true)` is the only way to get a `cid:` URL that will render reliably across clients.
- Don’t rely on `extends`/`include` working in templates stored via the API; use filesystem-imported templates if you want
  hierarchies.
