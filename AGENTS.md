# AGENTS.md

This file defines rules and expectations for automated agents
(AI code assistants, bots, CI agents, and other non-human actors)
interacting with this repository.

---

## Commit and Change Logging Rules

- **Automated commits or pull requests:** Not allowed unless explicitly requested.

If code is generated or substantially modified by an automated agent:

- All commits must be recorded in `CHANGES`.
- The use of an automated agent must be clearly disclosed.
- Disclosure must appear in the corresponding `CHANGES` entry (not in the commit message).
- Disclosure should contain LLM info (name/mode) if possible.
- Profile-style model/mode identifiers are acceptable (for example:
  `5.3-codex/medium`) as long as automated involvement is explicit.
- No claim of human authorship may be implied for AI-generated content.

Maintainers may reject contributions that do not disclose automated
involvement.

When modifying this repository (if explicitly authorized):

- `CHANGES` must be updated for every commit.
- New change entries added after a released version must always be placed at
  the top of `CHANGES` under `Unreleased (<YYYY-MM-DD>)`.
- If an `Unreleased` section already exists, append new bullets to that
  existing top section instead of creating a second one.
- When bumping package version/revision/patch for a release, convert the
  current top `Unreleased (<YYYY-MM-DD>)` section into
  `Version <bumped-version> (<YYYY-MM-DD>)` before tagging/publishing.
- Keep release sections in descending order below `Unreleased`.
- Use concise bullet points describing user-visible behavior changes, fixes,
  docs updates, and security changes.
- For AI-generated or AI-assisted work, include a disclosure bullet in the same
  `Unreleased` section using parentheses.

Required `CHANGES` format:

- First line: `CHANGES`
- Second line: `=======`
- Top section header: `Unreleased (<YYYY-MM-DD>)`
- Entry format:
  `- <type(scope)>: <short description>`
- AI disclosure format:
  `- (Changes generated/assisted by <agent> (profile: <model/mode>).)`

---

## Package and Dependency Management Rules

When modifying code (if explicitly authorized):

- Do not add, remove, or upgrade dependencies unless explicitly requested.

---

## Scope and Safety Rules

Write or modify access is permitted **only** when one of the following
conditions is met:

1. A maintainer explicitly requests changes from an automated agent
   in an issue, pull request, or other documented instruction.
2. A maintainer provides a direct prompt authorizing code changes
   for a clearly defined task and scope.

In all cases:

- Changes must be strictly limited to the requested scope.
- No additional refactors, cleanups, stylistic changes, or
  behavior changes are permitted unless explicitly requested.

If explicit instructions from a maintainer conflict with this
file, the maintainer's instructions take precedence.
