# Release TODO

Reviewed against the repository state on 2026-03-07.

Pre-release checklist for a public product launch of mail-magic.

---

## Blockers

### 1. Align package versions, tags, and `CHANGES`

Package versions and versioned `CHANGES` sections are now aligned again, but the release process is still incomplete
until the matching tags exist and the final release checks are run.

A public release should map cleanly from source tree -> package version -> changelog section -> git tag.

- [x] Bump package versions for every package with unreleased changes
- [x] Convert the top `Unreleased` section into a versioned release section when cutting the release
- [ ] Ensure git tags match the package versions being released
- [ ] Run the shared `release:check` flow before creating any public release

### 2. Add a real license file

The repo now has a root `LICENSE` file. The remaining question is whether each published package should also include a
package-local copy/reference.

- [x] Add `LICENSE` to the repo root with the standard MIT text
- [ ] Optionally copy or reference it from package directories if publishing packages independently

### 3. Regenerate the OpenAPI spec

The packaged spec has been refreshed. Keep it in sync with future server releases so the docs do not drift again.

- [x] Regenerate `openapi.json` so it matches the current server surface
- [x] Verify the spec includes `/api/v1/reload`
- [x] Bump the spec version alongside the server release

### 4. Fix the install story for npm consumers

The server README now points npm users to the packaged `examples/.env-dist` and `examples/data` paths. What remains is
an end-to-end validation of that quick start from a packed tarball or fresh install.

- [x] Either ship a sample env file in `@technomoron/mail-magic` or update the README to point to a packaged path
- [ ] Validate the quick start from a packed tarball or fresh `npm install`, not only from the monorepo checkout
- [x] Make sure every path referenced by the server README exists in the published package

### 5. Release automation must gate and publish correctly

Server/client/cli GitHub Actions release workflows now:

- install dependencies
- run `pnpm lint`, `pnpm test`, and `pnpm build`
- run package-level `release:check`
- `npm pack`
- publish to npm on matching tag pushes
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

## Overall Verdict

The engine looks close to releaseable, but the productization layer is not done yet.

If the goal is a public technical beta of the server/client/cli stack, this is close after the blocker list above is
resolved.

If the goal is a polished public product launch, the admin story, release automation, install story, and operator docs
still need work.
