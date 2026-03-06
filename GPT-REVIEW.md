# GPT Review

Findings

1. Fixed (was High): the server route contract is now fixed to `/api`, `/asset`, and `/api/swagger`, so the previous
   client/CLI incompatibility with configurable server paths no longer applies.
    - The server no longer exposes `API_BASE_PATH`, `ASSET_ROUTE`, or `SWAGGER_PATH`; docs/examples now describe the
      fixed routes instead.
    - The client and CLI still assume `/api` and `/asset`, but that is now the intended server contract rather than a
      cross-package mismatch.

2. Fixed (was High): `POST /api/v1/tx/template` now clears stale transactional template asset metadata on update.
    - `post_template()` now resets `files` instead of leaving old imported asset metadata behind.
    - Added regression coverage in `packages/server/tests/mail-magic.test.ts` to verify API updates do not keep or
      resend old template attachments.

3. Fixed (was Medium): `mm-cli push-dir` now preserves the newer form configuration fields.
    - The CLI forwards `replyto_email`, `replyto_from_fields`, `allowed_fields`, and `captcha_required` when uploading
      form templates.
    - Added regression coverage in `packages/cli/tests/cli-helpers.test.ts` to prove those fields round-trip through
      `push-dir`.

4. Fixed (was Medium): `mm-cli push-dir --patch-source-ids` now matches forms by effective locale, including
   domain-default locale inheritance.
    - The write-back matcher no longer requires a literal stored `form.locale` match when the effective locale comes
      from the owning domain.
    - Added regression coverage in `packages/cli/tests/cli-helpers.test.ts` for the inherited-locale `form_key`
      write-back case.

5. Low: the tutorial over-promises `DB_AUTO_RELOAD`; the code only watches `init-data.json`, not template or asset
   files.
    - The implementation watches exactly `config_filename('init-data.json')` in
      `packages/server/src/store/store.ts:54-95`.
    - The tutorial still says `DB_AUTO_RELOAD=1` will "hot-reload init-data and templates" and that "editing templates
      or assets is as simple as saving the file" in `packages/server/docs/tutorial.md:22-27` and
      `packages/server/docs/tutorial.md:330-333`.
    - Operators following the tutorial will expect live template reloads that never happen unless they also touch
      `init-data.json`.

6. Fixed (was Medium): `packages/server/tests/form-contract.test.ts` now matches the actual contract and asserts
   delivered recipient behavior.
    - The misleading test titles were corrected.
    - The legacy recipient override coverage now verifies that mail still goes to the configured owner instead of
      silently honoring attacker-controlled recipient fields.

7. Medium: the integration harness is not hermetic because it requires real TCP listeners on `127.0.0.1`, which can make
   large parts of the suite unusable in restricted runners.
    - The shared integration helper binds ephemeral ports through `net.createServer()` and
      `server.app.listen(..., '127.0.0.1')` in `tests/helpers/integration-setup.ts:64-75` and
      `tests/helpers/integration-setup.ts:185-196`.
    - The server package helper also starts a real SMTP listener on `127.0.0.1` in
      `packages/server/tests/helpers/test-setup.ts:212-215`.
    - The suite passes in a normal local environment, but it still depends on OS/network capabilities that a more
      hermetic test harness would avoid. Even if the project accepts that tradeoff in CI, it is still test fragility
      worth documenting.

8. Fixed (was Low): the root integration suite teardown now guards `ctx.cleanup()` when setup fails.
    - `tests/integration/mail-magic.integration.test.ts` now matches the safer guarded pattern already used in the
      client integration suite.

9. Fixed (was Medium): the route-contract test concern no longer applies because configurable `API_BASE_PATH`,
   `ASSET_ROUTE`, and `SWAGGER_PATH` were removed from the server contract.
    - The client tests still assert fixed `/api`, `/asset`, and `/api/asset` URLs, but that now matches the intended
      product behavior.

Open Questions / Assumptions

- Finding 2 assumes the current Sequelize upsert behavior remains the same across supported dialects. I spot-checked
  that behavior locally against SQLite while reviewing.

Testing

- `pnpm test` completed successfully on 2026-03-06 after the added regression coverage.
- Passing suites:
    - `packages/server`: 11 files, 59 tests
    - `packages/client`: 2 files, 22 tests
    - `packages/cli`: 4 files, 18 tests
    - `test:examples`: 1 targeted example test passed; 12 other example cases were skipped by the command filter
    - root function/integration suite: 1 file, 2 tests

Missing Tests

- No additional high-confidence missing tests remain from the items reviewed above after the server and CLI regressions
  added on 2026-03-06.
