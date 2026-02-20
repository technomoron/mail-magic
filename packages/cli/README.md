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
```

`MMCLI_TOKEN` is treated as the server token string. As a convenience, `MMCLI_USERNAME` + `MMCLI_PASSWORD` can be used
to build a combined token string (for legacy setups).

### Template Commands

Compile a config tree locally:

```bash
mm-cli compile --input ./data --output ./compiled
```

Compile only transactional or form templates:

```bash
mm-cli compile --input ./data --output ./compiled --tx
mm-cli compile --input ./data --output ./compiled --form
```

Push a single transactional template (compile + upload):

```bash
mm-cli push --template tx-template/en/welcome --domain example.test --input ./templates
```

Dry-run a single template upload:

```bash
mm-cli push --template tx-template/en/welcome --domain example.test --input ./templates --dry-run
```

Push an entire config-style directory:

```bash
mm-cli push-dir --input ./data --domain example.test
mm-cli push-dir --input ./data --domain example.test --dry-run
mm-cli push-dir --input ./data --domain example.test --skip-assets
```

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
