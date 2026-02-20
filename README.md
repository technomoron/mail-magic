# mail-magic (monorepo)

This repository contains:

- `packages/mail-magic` - server (`@technomoron/mail-magic`)
- `packages/mail-magic-client` - typed client library (`@technomoron/mail-magic-client`)
- `packages/mm-cli` - CLI (`@technomoron/mail-magic-cli`)
- `packages/mail-magic-admin` - admin UI placeholder (`@technomoron/mail-magic-admin`)

Package documentation:

- `packages/mail-magic/README.md`
- `packages/mail-magic/TUTORIAL.MD`
- `packages/mail-magic-client/README.md`
- `packages/mm-cli/README.md`

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
npx tsx examples/minimal-server/server.ts
```

See `examples/minimal-server/README.md` for scripts that store templates, send messages, and demonstrate public form
recipient allowlists.
