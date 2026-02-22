# Claude Project Configuration

This project follows the architecture defined in AGENTS.md.
Read AGENTS.md before performing structural changes.

## Package Manager
Keep package manager usage agnostic.
Do not hardcode pnpm/yarn/npm-only commands in shared configs.

## CI Rules
Use install/build/test commands via root npm scripts (orchestrated with `run-s`).
