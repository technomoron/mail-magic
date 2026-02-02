# mail-magic monorepo

This repo contains:

- packages/mail-magic (server)
- packages/mail-magic-client (client)
- packages/mail-magic-admin (Vue admin UI placeholder, served from the server `/`)

Each package keeps its own README and release notes.

Development is optimized for pnpm (faster installs/hoisting), while CI and publishing use npm. If pnpm is unavailable on
a build host, npm is the fallback.
