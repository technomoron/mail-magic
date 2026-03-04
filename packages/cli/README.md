# @technomoron/mail-magic-cli

CLI for the mail-magic server.

## Install

```bash
npm install @technomoron/mail-magic-cli
```

## Commands

### .mmcli-env

Create `.mmcli-env` in your working directory to set defaults:

```ini
MMCLI_API=http://127.0.0.1:3776
MMCLI_TOKEN=example-token
MMCLI_DOMAIN=example.test
MMCLI_ALLOW_UNSAFE_TEMPLATE_PATHS=false
```

`MMCLI_TOKEN` is treated as the server token string. As a convenience, `MMCLI_USERNAME` + `MMCLI_PASSWORD` can be used
to build a combined token string (for legacy setups).

`MMCLI_ALLOW_UNSAFE_TEMPLATE_PATHS` is `false` by default. Set it to `true` only for legacy migrations where
`init-data.json` contains template `filename` paths that are absolute or include `..` traversal.

### Version

Print the installed CLI version:

```bash
mm-cli version
```

### Template Commands

Compile a config tree locally:

```bash
mm-cli compile --input ./data --output ./compiled
```

`--css <path>` optionally points to a Foundation for Emails CSS file; when provided, MJML templates are inlined with
that stylesheet before upload.

Compile only transactional or form templates:

```bash
mm-cli compile --input ./data --output ./compiled --tx
mm-cli compile --input ./data --output ./compiled --form
```

Push a single transactional template (compile + upload):

```bash
mm-cli push --template tx-template/en/welcome --domain example.test --input ./templates
```

The `push` command also accepts `--css` to inline a Foundation for Emails stylesheet.

Dry-run a single template upload:

```bash
mm-cli push --template tx-template/en/welcome --domain example.test --input ./templates --dry-run
```

Push an entire config-style directory:

```bash
mm-cli push-dir --input ./data --domain example.test
mm-cli push-dir --input ./data --domain example.test --dry-run
mm-cli push-dir --input ./data --domain example.test --skip-assets
mm-cli push-dir --input ./data --domain example.test --skip-tx
mm-cli push-dir --input ./data --domain example.test --skip-forms
```

`push-dir` also accepts `--css` to inline a Foundation for Emails stylesheet during the upload pass.

Write-back/locking options for `push-dir`:

- `--write-back-lock` / `--no-write-back-lock`: enable/disable lock/state file handling in
  `.mail-magic-sync.json` (enabled by default)
- `--lock-wait-ms <ms>`: wait time for an active lock before failing (default `120000`)
- `--patch-source-ids`: patch resolved IDs/keys (currently `form_key`) back into `init-data.json`
- `--backup`: create `init-data.json.bak.<timestamp>` before patching source data

Config-tree records can be matched by natural keys (`domain` name) in addition to numeric `domain_id` hints.

### Asset Uploads

Upload stand-alone domain assets:

```bash
mm-cli assets --file ./logo.png --domain example.test
```

Dry-run an asset upload:

```bash
mm-cli assets --file ./logo.png --domain example.test --dry-run
```

Upload assets scoped to a template:

```bash
mm-cli assets --file ./hero.png --domain example.test --template-type tx --template welcome --locale en --path images
```
