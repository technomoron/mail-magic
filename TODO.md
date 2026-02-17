# TODO: REVIEW.md Follow-up (2026-02-17)

## REVIEW

- Housekeeping rule:
  Always move finished items out of active sections into `## Completed`.
- Trust model clarification:
  Authenticated template authors are not automatically trusted. They may be foreign developers or customers.
- Impact on review item #1:
  Treat untrusted template authors as a higher-risk scenario. Field sanitization alone is insufficient; template trust controls are the key concern.
- Current intent:
  No implementation change requested in this step. Keep this note as context for future security decisions.

## Critical / Security

- [ ] **#1 SSTI via Nunjucks vars**  
       Decision: `partially-disagree`  
       Action: Keep `AUTOESCAPE_HTML=true` as default; document trust boundary for template authors and `|safe` usage.  
       Pitfalls: Treating this as direct SSTI may cause over-engineering in the wrong layer.

## Bugs / Correctness

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

## Suggested Implementation Order

- [ ] **Now (high value / low risk):** #13, #12
- [ ] **Next:** #10
- [ ] **Backlog / design:** #1, #11, #14

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

- [x] **#2 Legacy plaintext token fallback (`server.ts`)**  
       Decision: `agree`  
       Action: Removed plaintext-token fallback in request authentication; API auth is now `token_hmac` only. Updated
      migration test coverage to verify pre-migration rejection and post-migration success.  
       Pitfalls: Deployments with unmigrated plaintext tokens must run migration before legacy tokens can authenticate.

- [x] **#5 Duplicate `normalizeRoute` (`index.ts`, `swagger.ts`)**  
       Decision: `agree`  
       Action: Extracted shared `normalizeRoute` helper into `src/util/route.ts` and reused in both modules. Added test
      coverage.
       Pitfalls: Minimal refactor risk only.

- [x] **#6 Duplicate `normalizeBoolean`/`getBodyValue` claim**  
       Decision: `disagree` (outdated finding)  
       Action: Confirmed single-source implementations in `util/utils.ts`; standardized `getBodyValue` imports to
      reference `util/utils` directly where used.
       Pitfalls: None.

- [x] **#9 Dead null check after `createTransport()`**  
       Decision: `agree`  
       Action: Removed unreachable `if (!mailer)` guard in transport creation.
       Pitfalls: None.

- [x] **#15 Commented-out code cleanup**  
       Decision: `agree`  
       Action: Removed stale commented-out debug/dead code in server/client source where appropriate.
       Pitfalls: Kept explanatory comments that document behavior.

- [x] **#16 Unused code cleanup (`load_api_keys`, `keys`, interfaces)**  
       Decision: `agree`  
       Action: Removed unused key-loading path (`api_key`, `ImailStore`, `keys`, `load_api_keys`, `get_api_key`) and
      consolidated duplicated mail validation usage.
       Pitfalls: Verified no remaining references before deletion.

- [x] **#18 Client `validateTemplate` hardcoded loader path**  
       Decision: `partially-agree`  
       Action: Switched client template validation to syntax compile without hardcoded cwd loader dependency. Added tests.
       Pitfalls: Include path resolution is now intentionally deferred to server-side processing.

- [x] **#19 `storeTemplate` vs `storeTxTemplate` duplication**  
       Decision: `agree` (compatibility-driven)  
       Action: Kept backward-compatible alias, but removed duplicated validation logic by delegating directly to
      `storeTxTemplate`. Added alias behavior test.
       Pitfalls: No breaking API change introduced.

- [x] **#20 CLI `__dirname` usage**  
       Decision: `partially-disagree` (works in current CJS build)  
       Action: Replaced `__dirname` package-version lookup with argv/cwd-based resolver and extracted helper for tests.
       Pitfalls: Resolver now depends on executable location conventions; added fallback candidates.
