# Ideas

## Form Database Storage

Store incoming form submissions and file metadata in a database so the admin API can browse past submissions and locate
uploaded files later. Include a retention policy and access controls.

## Form Submitter Receipt Emails

Send an optional receipt email to the submitter after `POST /v1/form/message` succeeds.

- Use transactional templates for receipts (not form templates).
- Support a domain default receipt template name (example: `form-submission`).
- Support per-form override via a new optional form field (example: `receipt_template`).
- Only send when submitter email exists and validates (for example from `_fields_.email`).
- Receipt should include submitted field values and a text-only file summary (filenames only), without attaching uploaded
  files.

### Locale strategy

- Keep default language template at root (`locale=''`), e.g. `tx-template/form-submission.njk`.
- Put locale overrides under locale folders, e.g. `tx-template/en/form-submission.njk`.
- Resolve in deterministic order: requested locale first, then root fallback (`''`).
