# mail-magic (monorepo)

This repository contains:

- `packages/server` - server (`@technomoron/mail-magic`)
- `packages/client` - typed client library (`@technomoron/mail-magic-client`)
- `packages/cli` - CLI (`@technomoron/mail-magic-cli`)
- `packages/mail-magic-admin` - admin UI placeholder (`@technomoron/mail-magic-admin`)
- `packages/examples` - runnable example suite and template set

Package documentation:

- `packages/server/README.md`
- `packages/server/TUTORIAL.MD`
- `packages/client/README.md`
- `packages/cli/README.md`

Development is optimized for `pnpm` (faster installs/hoisting). CI/publishing can use npm as a fallback.

## Quick Start

```bash
pnpm install
pnpm test
pnpm cleanbuild
```

## Example Server

Start a local mail-magic server using a tiny config directory and SQLite DB:

```bash
pnpm --filter @technomoron/mail-magic-examples run start
```

See `packages/examples/README.md` for scripts and template examples including form, locale, welcome, confirm,
password-change, receipt, and invoice templates.
