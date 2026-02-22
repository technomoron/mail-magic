# Mail Magic Example Suite

This package is the canonical example setup for Mail Magic. It replaces the old top-level `examples/` folder.

It contains:

- runnable local server configuration
- transactional templates with shared parent/base layout
- form templates with shared parent/base layout
- locale variants (`en`, `nb`)
- template families for welcome, confirm, change-password, receipt, invoice

## What Is Included

`packages/examples/data/example.test/` includes:

- `tx-template/base.njk` + locale variants under `tx-template/en` and `tx-template/nb`
- `form-template/base.njk` + locale variants under `form-template/en` and `form-template/nb`
- partials for reusable sections in both tx and form templates
- `init-data.json` entries that reference all example templates/forms for `mm-cli compile`

## Run The Example Server

From repo root:

```bash
pnpm --filter ./packages/examples run start
```

This runs the `mail-magic` server bin directly:

- env file: `packages/examples/.env-dist`
- config dir: `packages/examples/data`
- default API host: `http://127.0.0.1:3776`

## Default Demo Credentials

Defined in `packages/examples/data/init-data.json`:

- domain: `example.test`
- token: `example-token`

Use auth header:

```text
Authorization: Bearer apikey-example-token
```

## Validate Templates With `mm-cli compile`

From repo root:

```bash
node packages/cli/dist/cli.js compile \
  --input ./packages/examples/data \
  --output /tmp/mm-compiled-examples \
  --domain example.test
```

This compiles all templates listed in `init-data.json` and is the fastest local sanity check for real usage.

## Helper Scripts

From repo root:

```bash
pnpm --filter ./packages/examples run send
pnpm --filter ./packages/examples run public-form
pnpm --filter ./packages/examples run mm-api -- template --file ./data/example.test/tx-template/en/welcome.njk --name welcome --domain example.test
```

## Production Adaptation Checklist

For real projects, copy this package and change:

1. `packages/examples/.env-dist`: `API_URL`, `API_TOKEN_PEPPER`, DB settings, SMTP settings, upload path.
2. `packages/examples/data/init-data.json`: users, domains, tokens, sender/recipient addresses.
3. `packages/examples/data/<your-domain>/tx-template/*`: brand, content, locale text, assets.
4. `packages/examples/data/<your-domain>/form-template/*`: subjects, recipient routing, exposed fields.

Then run:

```bash
pnpm cleanbuild
pnpm test
node packages/cli/dist/cli.js compile --input ./packages/examples/data --output /tmp/mm-compiled-examples --domain <your-domain>
```
