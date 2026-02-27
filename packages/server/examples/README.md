# Mail Magic Examples

The canonical example setup for Mail Magic. Shipped inside the `@technomoron/mail-magic` package so it is accessible
without a private repo clone:

```bash
ls node_modules/@technomoron/mail-magic/examples/
```

It contains:

- `data/` — runnable server config: `init-data.json` + `example.test/` domain with transactional and form templates
- `scripts/` — helper TypeScript scripts for sending messages and testing the API
- `.env-dist` — example environment file for local development

Template families: welcome, confirm, change-password, receipt, invoice (tx) and contact, welcome-signup,
confirm-account, change-password (form). Locale variants: `en`, `nb`.

## Run The Example Server

From repo root:

```bash
pnpm examples
```

This runs the `mail-magic` server bin with:

- env file: `packages/server/examples/.env-dist`
- config dir: `packages/server/examples/data`
- default API host: `http://127.0.0.1:3776`

## Default Demo Credentials

Defined in `data/init-data.json`:

- domain: `example.test`
- token: `example-token`

```text
Authorization: Bearer apikey-example-token
```

## Validate Templates With `mm-cli compile`

From repo root:

```bash
node packages/cli/dist/cli.js compile \
  --input ./packages/server/examples/data \
  --output /tmp/mm-compiled-examples \
  --domain example.test
```

## Helper Scripts

From repo root (requires `tsx`):

```bash
tsx packages/server/examples/scripts/send-messages.ts
tsx packages/server/examples/scripts/public-form.ts
tsx packages/server/examples/scripts/mm-api.ts template \
  --file packages/server/examples/data/example.test/tx-template/en/welcome.njk \
  --name welcome --domain example.test
```

## Production Adaptation

Copy the `data/` directory and `.env-dist` to your project and adapt:

1. `.env-dist` → `.env`: set `API_TOKEN_PEPPER`, SMTP settings, `API_URL`, DB path.
2. `data/init-data.json`: users, domains, tokens, sender/recipient addresses.
3. `data/<your-domain>/tx-template/*`: brand, content, locale text, assets.
4. `data/<your-domain>/form-template/*`: subjects, recipient routing, exposed fields.
