# Mail Magic Batch Sync + Shared Compiler Plan

## Goal

Implement a robust config-directory batch sync workflow and remove compiler drift between server and client by using one
shared compile implementation.

## Scope Summary

- Shared template compiler code in `shared/` synced into package-local sources at build/test time
- Deterministic `push-dir` behavior across templates/forms/assets
- Metadata sync model that avoids hard-coding numeric IDs in source config
- Optional write-back for resolved IDs/keys with safe defaults
- Package boundary cleanup: `mm-cli` as its own package and `mail-magic-client` as a thin typed API layer

## Constraints

- Keep source config portable across environments
- Do not require hard numeric IDs in `data.json` / `init-data.json`
- Preserve existing CLI usage where possible
- Keep behavior explicit when mutating local files
- Keep `mail-magic-client` aligned to server API contracts and avoid embedding CLI workflow logic there

## Phase 1: Shared Compiler Foundation

Status: completed

### Deliverables

1. Create a shared source directory for compile logic (no standalone workspace package runtime dependency).
2. Expose a stable API for compile/flatten operations used by both server and client.
3. Migrate client `compileTemplate` calls (`push`, `push-dir`) to use shared synced source.
4. Keep output parity with current behavior or clearly document any intentional differences.

### Acceptance Criteria

- Client builds and tests pass for preprocess/compile paths.
- No duplicate compile core between server/client for migrated path.

## Phase 2: Server Alignment

Status: completed

### Deliverables

1. Migrate server template import preprocessing (`models/init.ts`) to same shared synced API.
2. Preserve server asset extraction and CID behavior.
3. Add parity tests that compare server and client compile results for shared fixtures.

### Acceptance Criteria

- Server tests around template import/assets pass.
- Shared compiler is authoritative for both runtime paths.

## Phase 3: Batch Data Model (ID-safe)

Status: pending

### Deliverables

1. Support domain-local config data keyed by natural keys (`domain`, `name+locale`, `idname+locale`).
2. Treat numeric IDs as optional hints only.
3. Resolve IDs/form keys from server responses during sync.

### Acceptance Criteria

- Multi-domain sync works without hard IDs in source data.
- Deterministic upsert behavior for domain/template/form/recipient mappings.

## Phase 3.5: Package Split (`mm-cli` vs client)

Status: completed

### Deliverables

1. Create a dedicated `mm-cli` package for CLI commands/workflows.
2. Keep `mail-magic-client` focused on typed request/response methods mirroring server endpoints.
3. Move current CLI-only helpers (`push-dir`, compile orchestration, write-back flows) into `mm-cli`.
4. Keep backward compatibility via command aliasing/deprecation path where needed.

### Acceptance Criteria

- `mail-magic-client` exports a thin typed comms surface only.
- CLI behavior remains functional from the new package with clear migration notes.
- Type definitions map directly to server API payloads/responses.

## Phase 3.6: `mm-cli` Compile Output Workflow

Status: completed

### Deliverables

1. Add/standardize an `mm-cli` workflow that takes `--input <dir>` and writes compiled templates to `--output <dir>`.
2. Support config-style trees (tx/form template directories) for batch compile without uploading.
3. Preserve relative structure in output for deterministic CI artifacts.
4. Add dry-run/report mode showing discovered templates and generated output paths.

### Acceptance Criteria

- Running compile against a template directory writes compiled files to the configured output directory.
- Output structure is stable and mirrors source layout rules.
- CLI tests cover happy path and failure path (missing include, path traversal guard).

## Phase 4: Write-back + Locking

Status: pending

### Deliverables

1. Add sync-state file in config dir (default): `.mail-magic-sync.json`.
2. Add explicit write-back flags:
    - `--write-back-lock` / `--no-write-back-lock`
    - `--patch-source-ids`
    - `--backup`
3. Implement safe patch workflow and backups for source file mutation.

### Acceptance Criteria

- Default sync does not mutate source config.
- Source mutation is opt-in and recoverable.

## Phase 5: CLI UX + Docs

Status: pending

### Deliverables

1. Keep `push-dir` and optionally add ergonomic aliasing for “push config dir”.
2. Document sync/write-back behavior in client README.
3. Add examples for multi-domain config batch workflows.

### Acceptance Criteria

- CLI help and README reflect new behavior.
- Dry-run and real-run outputs are actionable.

## Phase 6: Test Matrix

Status: pending

### Deliverables

1. Shared package unit tests (golden fixtures for html + assets).
2. Client tests for dry-run/action planning and write-back modes.
3. Server integration tests for template import parity.

### Acceptance Criteria

- Tests cover happy path + failure modes (missing include, invalid mapping, patch conflicts).

## Implementation Order

1. Phase 1 (now)
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5 + Phase 6 finishing pass
