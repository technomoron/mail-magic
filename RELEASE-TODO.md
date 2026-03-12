# Release TODO

Reviewed against the repository state on 2026-03-07.

Pre-release checklist for the initial public release of the mail-magic package set.

Versioning policy for the public repo:

- The root-level repo tracks only the shared `major.minor` public release line.
- There is no repo-wide patch version.
- Each public package versions independently with full semver: `major.minor.patch`.
- `major` changes for breaking changes in that package.
- `minor` changes for backward-compatible features in that package.
- `patch` changes for backward-compatible fixes in that package.
- Public packages should stay on the current root-level `major.minor` line unless there is a deliberate reason for a package to diverge.
- Public release tags must always be package-qualified (for example `@technomoron/mail-magic-server@2.0.0`).
- The clean-slate public reset establishes the first public versions for each package; future releases continue from
  those package-specific baselines.
- For the first public release, the baseline is `2.0.0` for each public package; after that, patch versions may drift
  independently within the shared root-level `major.minor` line.

---

## Blockers

### 1. Align package versions, tags, and `CHANGES`

Package versions and versioned `CHANGES` sections are now aligned again, but the release process is still incomplete
until the matching tags exist and the final release checks are run.

A public release should map cleanly from source tree -> package version -> changelog section -> package-qualified git
tag.

- [x] Bump package versions for every package with unreleased changes
- [x] Convert the top `Unreleased` section into a versioned release section when cutting the release
- [ ] Ensure package-qualified git tags match the package versions being released
- [ ] Run the shared `release:check` flow before creating any public release

### 2. Switch license to AGPL v3 + CLA

The current MIT license permits anyone to run mail-magic as a commercial hosted service without contributing back.
Switch to AGPL v3 (deters SaaS resellers via copyleft) with a CLA so contributors grant you the right to incorporate
their changes.

- [ ] Confirm you hold the necessary rights to relicense all included code (or get explicit consent from any other copyright holders)
- [ ] Replace `LICENSE` with AGPL v3 text
- [ ] Add a `CLA.md` describing the contributor agreement
- [ ] Add a `CONTRIBUTING.md` referencing the CLA and explaining how to sign
- [ ] Update license field in all `package.json` files from `"MIT"` to `"AGPL-3.0-only"`
- [ ] Update any license headers or references in README files
- [ ] Set up CLA bot (e.g. cla-assistant.io) on the GitHub repo so PRs are gated on CLA signature
- [ ] Optionally copy or reference LICENSE from package directories if publishing packages independently

### 3. Regenerate the OpenAPI spec

The packaged spec has been refreshed. Keep it in sync with future server releases so the docs do not drift again.

- [x] Regenerate `openapi.json` so it matches the current server surface
- [x] Verify the spec includes `/api/v1/reload`
- [x] Bump the spec version alongside the server release

### 4. Fix the install story for npm consumers

The server README now points npm users to the packaged `examples/.env-dist` and `examples/data` paths. What remains is
an end-to-end validation of that quick start from a packed tarball or fresh install.

- [x] Either ship a sample env file in `@technomoron/mail-magic-server` or update the README to point to a packaged path
- [ ] Validate the quick start from a packed tarball or fresh `npm install`, not only from the monorepo checkout
- [x] Make sure every path referenced by the server README exists in the published package

### 5. Release automation must gate and publish correctly

Server/client/cli GitHub Actions release workflows now:

- install dependencies
- run `pnpm lint`, `pnpm test`, and `pnpm build`
- run package-level `release:check`
- `npm pack`
- publish to npm on matching package tag pushes
- create a GitHub Release with the tarball

Admin release publication is still undecided.

- [x] Add `pnpm lint`, `pnpm test`, and `pnpm build` to release workflows
- [x] Add package-level `release:check` before packing/releasing
- [x] Decide whether public release means GitHub-only artifacts or npm publication
- [x] Add a public CLI release workflow
- [ ] If publishing admin publicly, add a release workflow for that package too

---

## High Priority

### 6. Harden the starter config for public form deployments

The current sample env is too permissive for a public-facing product launch:

- `DB_SYNC_ALTER=true`
- `SMTP_TLS_REJECT=false`
- `FORM_RATE_LIMIT_MAX=0`
- `FORM_MAX_ATTACHMENTS=-1`
- `FORM_CAPTCHA_REQUIRED=false`

Those defaults are reasonable for local development, but not as the primary starting point for an internet-facing form
endpoint.

- [ ] Split the example env into clearly named dev vs production-safe variants, or
- [ ] Make the default sample safer and document how to relax it locally
- [ ] Consider a startup warning when public forms are enabled with no rate limiting and no CAPTCHA

### 7. Decide the public release stance for `packages/admin`

The admin package is still explicitly a placeholder and currently ships only a minimal static UI.

- [ ] Do not market it as part of the public product until it is real
- [ ] Either mark it `private`, omit it from release automation, or label it clearly as experimental
- [ ] If keeping it public, align dependency versions and add meaningful tests/docs

### 8. Clarify supported database backends

The configuration surface suggests support for SQLite/MySQL/Postgres, but SQLite is the only clearly exercised path in
the repo and docs.

- [ ] Either document SQLite as the currently supported backend, or
- [ ] Add docs and test coverage for PostgreSQL/MySQL startup and migration flows

### 9. Add public product security / operations docs

The code is stronger than the operational guidance. For a public product launch, operators need documented procedures.

- [ ] Document API key rotation / revocation
- [ ] Document backup / restore expectations for the database and config tree
- [ ] Document upgrade / migration expectations between releases
- [ ] Document reverse-proxy expectations for trusted forwarded headers / client IP handling
- [ ] Add a `SECURITY.md` with a vulnerability reporting path

### 10. Clean up the CLI package tarball

The CLI package now publishes only built/runtime artifacts plus README / CHANGES / package metadata.

- [x] Add a `files` whitelist to `packages/cli/package.json`
- [x] Publish only the built CLI/runtime artifacts plus README / CHANGES / package metadata

---

## Moderate Priority

### 11. Beta framework dependency

`@technomoron/api-server-base@2.0.0-beta.24` is a core runtime dependency. Shipping a stable public product on a beta
dependency is possible, but it should be a conscious, documented choice.

- [ ] Promote `api-server-base` to a stable release, or
- [ ] Document why the beta dependency is acceptable for a public launch

### 12. Load / stress testing

Functional coverage is strong, but there is no dedicated load/stress test story for the unauthenticated form endpoint.

- [ ] Add at least one basic load profile for `/api/v1/form/message`
- [ ] Exercise concurrent submission scenarios and attachment-heavy cases

### 13. Improve `API_TOKEN_PEPPER` guidance

The variable is required and length-validated, but the sample docs do not give a generation command or a recommended
strength level.

- [ ] Add a generation example (for example `openssl rand -base64 32`)
- [ ] Mention the minimum supported length and a stronger recommended value

### 14. Public repo hygiene docs

For a public-facing project, repo-level policy docs help reduce ambiguity.

- [ ] Consider adding `CONTRIBUTING.md`
- [ ] Consider adding a brief support / maintenance policy

### 15. npm discoverability polish

This is much less important than release correctness, but still worth doing after the real blockers are closed.

- [ ] Add useful `keywords` to the server package
- [ ] Consider adding keywords to the client and CLI packages too

---

## Current Strengths

These areas already look strong enough for a public technical beta:

- `pnpm test`, `pnpm lint`, and `pnpm build` pass locally
- The server/client/cli packages all pack successfully with `npm pack --dry-run`
- Core TypeScript quality is strong: good validation, good route-level checks, consistent async/error handling
- Security work is substantial: HMAC token storage, domain ownership checks, path traversal hardening, header
  allowlisting, CAPTCHA support, rate limiting hooks, secure runtime defaults in code
- Documentation is already solid for a technical audience: server README, tutorial, form security guide, examples, and
  client/CLI READMEs
- The example set is strong and makes the product understandable quickly

## Git & Repo Cleanup (do immediately before going public)

One-shot operation — do this as the final step before making the repo public. Do not do it earlier as it rewrites
history and deletes all existing tags.

### Steps

1. **Delete clutter files from the repo**
   - `GPT-REVIEW.md` — internal AI review notes
   - `PLAN.md` — internal planning doc
   - `RELEASE-TODO.md` — this file (internal)
   - `how-to-github-npmjs.txt` — personal notes
   - `pkg.tgz` — binary artifact (also add to `.gitignore`)

2. **Fix root-owned files** — several files were created while running as root; `chown` or recreate before committing:
   - `LICENSE`, `README.md`, `scripts/release-package-preflight.sh`, `scripts/release-package-publish.sh`,
     `scripts/release-preflight.sh`, `scripts/release-verify.sh`

3. **Make the tree intentionally clean before rewriting history**
   - Remove any other temporary files or local-only notes not listed above
   - Run `git status --short` and confirm only intentional public-release files remain
   - Confirm no old prerelease tarballs, review notes, secrets, or scratch files will be captured in the fresh root commit

4. **Wipe git history with an orphan branch**
   ```bash
   git checkout --orphan fresh-main
   git add -A
   git commit -m "chore: initial 2.0.0 public release"
   git branch -D main
   git branch -m main
   git push --force origin main
   ```

5. **Delete all old tags from local and remote** — there are 40+ version tags from pre-public development and they
   should not survive the public reset:
   ```bash
   git tag | xargs -r git tag -d
   git for-each-ref --format='%(refname:strip=2)' refs/tags | xargs -r -n 1 git push origin --delete
   ```

6. **Create the initial public package tags** — there is no repo-wide version tag:
   ```bash
   git tag @technomoron/mail-magic-server@2.0.0
   git tag @technomoron/mail-magic-client@2.0.0
   git tag @technomoron/mail-magic-cli@2.0.0
   git push origin @technomoron/mail-magic-server@2.0.0
   git push origin @technomoron/mail-magic-client@2.0.0
   git push origin @technomoron/mail-magic-cli@2.0.0
   ```

7. **Verify** — the public repo should show exactly 1 root public commit and only the intended initial public package
   tags (for example `@technomoron/mail-magic-server@2.0.0`, `@technomoron/mail-magic-client@2.0.0`,
   `@technomoron/mail-magic-cli@2.0.0`).

---

## Overall Verdict

The engine looks close to releaseable, but the productization layer is not done yet.

If the goal is a public technical beta of the server/client/cli stack, this is close after the blocker list above is
resolved.

If the goal is a polished public product launch, the admin story, release automation, install story, and operator docs
still need work.
