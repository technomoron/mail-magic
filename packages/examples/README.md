# Mail Magic Example Suite

This workspace package replaces the old top-level `examples/` folder.

It includes:

- a runnable local mail-magic server started via the `mail-magic` bin
- reusable parent/base Nunjucks templates
- localized transactional templates (`en`, `nb`)
- localized form templates (`en`, `nb`)
- receipt/invoice templates

## Run

```bash
pnpm --filter @technomoron/mail-magic-examples run start
```

The server listens on `http://127.0.0.1:3776` and uses `packages/examples/data` as `CONFIG_PATH`. The start script runs
`../server/dist/esm/bin/mail-magic.js` directly with `--env ./.env-dist --config ./data`.

## API token

`data/init-data.json` defines:

- Domain: `example.test`
- User token: `example-token`

Use `Authorization: Bearer apikey-example-token` for authenticated endpoints.

## Helper scripts

```bash
pnpm --filter @technomoron/mail-magic-examples run send
pnpm --filter @technomoron/mail-magic-examples run public-form
pnpm --filter @technomoron/mail-magic-examples run mm-api -- template --file ./data/example.test/tx-template/en/welcome.njk --name welcome --domain example.test
```

## Template suite layout

```text
data/example.test/
  tx-template/
    base.njk
    partials/
    en/
    nb/
  form-template/
    base.njk
    partials/
    en/
    nb/
```

`en` and `nb` templates extend parent templates and share partials so the directory works as a practical starter suite.
