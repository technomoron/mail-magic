# mail-magic (monorepo)

This repository contains:

- `packages/server` - server (`@technomoron/mail-magic`)
- `packages/client` - typed client library (`@technomoron/mail-magic-client`)
- `packages/cli` - CLI (`@technomoron/mail-magic-cli`)
- `packages/mail-magic-admin` - admin UI placeholder (`@technomoron/mail-magic-admin`)

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
npx tsx examples/minimal-server/server.ts
```

See `examples/minimal-server/README.md` for scripts that store templates, send messages, and demonstrate public form
recipient allowlists.
