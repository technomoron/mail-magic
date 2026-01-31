# mail-magic-client

Client library and CLI for the mail-magic server.

## Install

```bash
npm install @technomoron/mail-magic-client
```

## Client Usage

```ts
import TemplateClient from '@technomoron/mail-magic-client';

const client = new TemplateClient('http://localhost:3000', 'username:token');

await client.storeTxTemplate({
	domain: 'example.test',
	name: 'welcome',
	sender: 'App <noreply@example.test>',
	subject: 'Welcome',
	template: '<p>Hello {{ name }}</p>'
});

await client.sendTxMessage({
	domain: 'example.test',
	name: 'welcome',
	rcpt: 'user@example.test',
	vars: { name: 'Sam' }
});
```

## CLI

The package ships `mm-cli`.

### .mmcli-env

Create `.mmcli-env` in your working directory to set defaults:

```ini
MMCLI_API=http://localhost:3000
MMCLI_TOKEN=username:token
# or, split token:
MMCLI_USERNAME=username
MMCLI_PASSWORD=token
MMCLI_DOMAIN=example.test
```

### Template Commands

Compile a template locally:

```bash
mm-cli compile --input ./templates --output ./templates-dist
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

## Notes

- `push-dir` expects a `init-data.json` and domain folders that match the server config layout.
- Asset uploads use the server endpoint `POST /api/v1/assets`.
