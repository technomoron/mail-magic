# mail-magic (monorepo)

This repository contains:

- `packages/server` - server (`@technomoron/mail-magic`)
- `packages/client` - typed client library (`@technomoron/mail-magic-client`)
- `packages/cli` - CLI (`@technomoron/mail-magic-cli`)
- `packages/admin` - admin UI placeholder (`@technomoron/mail-magic-admin`)

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

Start a local mail-magic server using the bundled example config:

```bash
pnpm examples
```

See `packages/server/examples/README.md` for the full template set and production adaptation checklist.
