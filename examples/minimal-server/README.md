# Minimal Server Example

This example boots the mail-magic server with a minimal config directory and a local SQLite database.

## Run

```bash
npx tsx examples/minimal-server/server.ts
```

The server listens on `http://127.0.0.1:3776` and expects the example data in `examples/minimal-server/data`.

## Default API token

The example `init-data.json` defines:

- Domain: `example.test`
- User token: `example-token`

Use `Authorization: Bearer apikey-example-token` for authenticated endpoints.

## Customize

You can override any environment variable before starting, for example:

```bash
API_PORT=4000 CONFIG_PATH=./my-data node examples/minimal-server/server.mjs
```

## Scripts

Send a transactional template or upload assets via curl:

```bash
npx tsx examples/minimal-server/scripts/mm-api.ts template \
  --file ./welcome.njk \
  --name welcome \
  --domain example.test \
  --sender "Example <noreply@example.test>" \
  --subject "Welcome"

npx tsx examples/minimal-server/scripts/mm-api.ts asset \
  --file ./logo.png \
  --domain example.test \
  --path images
```

Send a transactional message and a form message with the TypeScript helper:

```bash
npx tsx examples/minimal-server/scripts/send-messages.ts
```
