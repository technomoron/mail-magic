# Mail Magic — Pending Work

## Open Issues

### Security / Design

- **SSTI via Nunjucks vars** — Decision: partially-disagree. Keep `AUTOESCAPE_HTML=true` as default; document
  trust boundary for template authors and `|safe` usage. Treat authenticated template authors as potentially
  untrusted (foreign developers / customers); field sanitization alone is insufficient, template trust controls
  are the key concern.

### Design / Architecture

- **In-memory rate limiter (single-instance only)** — Decision: agree (informational). Document single-instance
  limitation in ops docs; optionally add a Redis-backed limiter path for multi-instance deployments.

- **Sequential recipient resolution queries** — Decision: agree. Batch / parallelize recipient DB lookups in
  `postSendForm` while preserving scoped-over-domain precedence semantics.

- **Resumable form uploads for large files** — Decision: agree. Add optional tus endpoint (`/api/v1/upload`) for
  chunked/resumable uploads, then keep `POST /api/v1/form/message` as the single business hook by accepting completed
  upload references (while preserving direct `_mm_file*` multipart as fallback for non-resumable clients).
  Add two delivery controls:
  1. support generating direct download links for uploaded files (especially large files), and
  2. add config to cap total/individual attachment size forwarded via email; when exceeded, omit attachment(s) and
     include secure direct download link(s) in the message/context.

---

## Pending Phases

### Phase 3: Batch Data Model (ID-safe)

### Deliverables

1. Support domain-local config data keyed by natural keys (`domain`, `name+locale`, `idname+locale`).
2. Treat numeric IDs as optional hints only.
3. Resolve IDs/form keys from server responses during sync.

### Acceptance Criteria

- Multi-domain sync works without hard IDs in source data.
- Deterministic upsert behavior for domain/template/form/recipient mappings.

---

### Phase 4: Write-back + Locking

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

---

### Phase 5: CLI UX + Docs

### Deliverables

1. Keep `push-dir` and optionally add ergonomic aliasing for "push config dir".
2. Document sync/write-back behavior in CLI README.
3. Add examples for multi-domain config batch workflows.

### Acceptance Criteria

- CLI help and README reflect new behavior.
- Dry-run and real-run outputs are actionable.

---

### Phase 6: Test Matrix

### Deliverables

1. Shared package unit tests (golden fixtures for html + assets).
2. Client tests for dry-run/action planning and write-back modes.
3. Server integration tests for template import parity.

### Acceptance Criteria

- Tests cover happy path + failure modes (missing include, invalid mapping, patch conflicts).
