# TODO: REVIEW.md Follow-up (2026-02-17)

## Critical / Security

- [ ] **#1 SSTI via Nunjucks vars**  
       Decision: `partially-disagree`  
       Action: Keep `AUTOESCAPE_HTML=true` as default; document trust boundary for template authors and `|safe` usage.  
       Pitfalls: Treating this as direct SSTI may cause over-engineering in the wrong layer.

- [ ] **#2 Legacy plaintext token fallback (`server.ts`)**  
       Decision: `agree`  
       Action: Add env kill-switch for legacy lookup; plan removal in next major release.  
       Pitfalls: Immediate removal can break deployments with unmigrated tokens.

## Bugs / Correctness

- [ ] **#5 Duplicate `normalizeRoute` (`index.ts`, `swagger.ts`)**  
       Decision: `agree`  
       Action: Extract shared helper in utility module and reuse.  
       Pitfalls: Low-value refactor churn.

- [ ] **#6 Duplicate `normalizeBoolean`/`getBodyValue` claim**  
       Decision: `disagree` (outdated finding)  
       Action: No code change needed; keep single source in `util/utils.ts`.  
       Pitfalls: Fixing non-issue could introduce real divergence.

- [ ] **#9 Dead null check after `createTransport()`**  
       Decision: `agree`  
       Action: Remove unreachable null check.  
       Pitfalls: None.

- [ ] **#10 Module-level mutable preprocess config (`mail-magic-client`)**  
       Decision: `agree`  
       Action: Refactor preprocess pipeline to use per-invocation config object.  
       Pitfalls: Refactor can break CLI/template compile behavior without regression tests.

## Design / Architecture

- [ ] **#11 In-memory rate limiter limitations**  
       Decision: `agree` (informational)  
       Action: Document single-instance limitation; optionally add Redis-backed limiter path.  
       Pitfalls: Extra operational complexity.

- [ ] **#12 `fs.watchFile` polling for auto-reload**  
       Decision: `agree`  
       Action: Prefer `fs.watch` with fallback to `watchFile`.  
       Pitfalls: Cross-platform watcher behavior differences.

- [ ] **#13 Sequential recipient resolution queries**  
       Decision: `agree`  
       Action: Batch/parallelize lookup while preserving scoped-over-domain precedence.  
       Pitfalls: Easy to break precedence semantics.

- [ ] **#14 Zod/Sequelize schema drift risk**  
       Decision: `agree` (informational)  
       Action: Add consistency tests/checks between schema and Sequelize model definitions.  
       Pitfalls: Tooling complexity and maintenance cost.

## Code Quality / Cleanup

- [ ] **#15 Commented-out code cleanup**  
       Decision: `agree`  
       Action: Remove stale commented debug/dead lines across server/client files.  
       Pitfalls: Avoid removing explanatory comments still useful for maintenance.

- [ ] **#16 Unused code cleanup (`load_api_keys`, `keys`, interfaces)**  
       Decision: `agree`  
       Action: Remove dead code paths or wire them back with tests if intentionally retained.  
       Pitfalls: Check for hidden internal usage before deleting.

- [ ] **#18 Client `validateTemplate` hardcoded loader path**  
       Decision: `partially-agree`  
       Action: Make loader path configurable or convert validation to syntax-only where appropriate.  
       Pitfalls: Changing validation strictness may break existing workflows.

- [ ] **#19 `storeTemplate` vs `storeTxTemplate` duplication**  
       Decision: `agree` (compatibility-driven)  
       Action: Keep alias for backward compatibility and mark one as deprecated.  
       Pitfalls: Removing alias too early is a breaking change.

- [ ] **#20 CLI `__dirname` usage**  
       Decision: `partially-disagree` (works in current CJS build)  
       Action: Optionally harden path resolution to be ESM-safe for future build changes.  
       Pitfalls: CJS/ESM compatibility handling can introduce path bugs.

## Suggested Implementation Order

- [ ] **Now (high value / low risk):** #2, #13, #12, #15, #16
- [ ] **Next:** #9, #5, #19, #20
- [ ] **Backlog / design:** #1, #10, #11, #14, #18

## Completed

- [x] **#3 Uncaught JSON.parse in model getters (`form.ts`, `txmail.ts`)**  
       Decision: `agree`  
       Action: Wrapped JSON parse in `try/catch` and safely return `[]`. Added regression tests.  
       Pitfalls: Silent fallback can hide data corruption unless logs are monitored.

- [x] **#7 Inconsistent form send error handling (`postSendForm`)**  
       Decision: `agree`  
       Action: Now throws `ApiError` instead of returning custom `[500, { error }]`. Added regression test for response
      shape.  
       Pitfalls: Response shape changed for clients expecting legacy `error` field.

- [x] **#8 SQLite PRAGMA without dialect guard (`db.ts`)**  
       Decision: `partially-agree`  
       Action: Added sqlite-dialect guard helper around PRAGMA calls. Added unit tests.  
       Pitfalls: None significant.

- [x] **#4 Stale startup error text ("FormMailer")**  
       Decision: `agree`  
       Action: Updated startup failure text to `Failed to start mail-magic:` and added test coverage.  
       Pitfalls: None.

- [x] **#17 Env description typo ("WP database")**  
       Decision: `agree`  
       Action: Updated `DB_TYPE` description to API-database wording and added test coverage.  
       Pitfalls: None.
