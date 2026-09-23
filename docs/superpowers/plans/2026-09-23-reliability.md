# HANA Reliability Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Complete the approved project review: reliable uploads and edits, recoverable capture, full backup/restore, configurable safe capacity, scalable reads, security fixes and repeatable verification.

**Architecture:** Extend the existing Worker/D1/R2 application with additive migrations and small shared helpers. Preserve originals, shared-account access and existing date/address navigation. Local IndexedDB holds pending originals; server idempotency and revision checks make reconnects safe. Full backups are a separate desktop directory workflow with SHA-256 verification; restores publish a new region only after all objects are verified.

**Tech Stack:** TypeScript, React, Vinext/Vite, Cloudflare Workers/D1/R2, browser IndexedDB/File System Access, Node test runner.

**Spec:** `../../../../PROJECT_REVIEW_2026-09-23.md` and the user's approval “전체 진행해봐”.

## Global Constraints

- Preserve raw uploaded originals and rotate only the existing site-camera capture path as already requested.
- Normal photo ZIP contains field photographs only; full administrative backups are separate.
- Keep default storage cap 8,000,000,000 bytes; only an administrator explicitly changes it. No automatic paid plan changes or production-data cleanup.
- Keep existing user edits. Work in the current external-cloudflare checkout because its deployed, uncommitted changes are the review baseline; do not reset or silently omit them.
- Validate locally with synthetic data before any deployment. This turn authorizes implementation; production publication is not necessary to validate it.

## Review Focus

- Server commit followed by response loss: retry same upload ID returns same photo; reuse with changed bytes is rejected.
- Two devices save old records: stale revision returns 409 and preserves both local draft and remote state.
- Browser termination/quota failure: durable pending photos restore, and persistence failure is explicit rather than falsely marked safe.
- Interrupted backup/restore: originals are hash-verified; incomplete restore remains hidden; retry cannot duplicate or overwrite live records.
- Large or unsupported inputs: strict origin for ticket issuance, inert image preview, bounded cursors/metadata/file sizes and migration-preserved totals.

## Task 1 — Upload and edit consistency

Files: new migration 0013, lib/upload-id.ts, lib/photo-upload.ts, app/api/library/route.ts, app/api/folders/route.ts, lib/folders.ts, lib/types.ts, app/report-tools.tsx, db/schema.ts; tests/reliability.integration.mjs.

Interfaces: `uploadId(file:File):string`, `identifyUpload(file,id):File`; `X-Upload-Id` stable across retry. `Folder.revision:number`; PATCH requires `revision` and returns updated revision or 409.

- [x] Add regression assertions `first.photo.id === retry.photo.id`, concurrent same ID has at most one R2 write, changed content same ID returns 409, stale PATCH returns 409 and leaves completed status.
- [x] Run against old local build and observe failures.
- [x] Add persistent upload receipt/claim with owner+ID uniqueness and immutable payload digest; failed uncommitted claims can be retried without concurrent writers. Publish metadata and receipt atomically. Retain completed receipt after photo deletion so stale retries cannot resurrect it.
- [x] Add conditional `UPDATE ... WHERE revision=? AND deleting=0 RETURNING revision`; return latest record to conflict UI.
- [x] Build, type-check and run the regression test.

## Task 2 — Close the two security boundaries

Files: app/api/export/route.ts, lib/download-archive.ts, lib/r2-budget.ts, app/import-schedule.tsx, new lib/raster-file.ts, focused tests.

Interfaces: `POST /api/export?filters` requires same-origin Origin; GET manifest does not mutate. Existing GET token stream remains. `validateRaster(file)` allows signature-confirmed JPEG/PNG/WEBP; enlargement stays in an img dialog.

- [x] Assert external POST/GET cannot charge budget; legitimate POST produces readable originals. Assert SVG/HTML and misleading MIME are rejected before preview, raster control accepted.
- [x] Move read charging to token redemption so abandoned manifests do not charge; keep ticket redemption owner-bound and single-use.
- [x] Replace raw-file navigation with inert image enlargement; preserve OCR-failure manual editing of supported rasters.
- [x] Run focused tests; fresh read-only security reviewer checks final patch once after implementation.

## Task 3 — Durable capture and failed uploads

Files: lib/pending-uploads.ts, app/pending-uploads.tsx, app/batch-camera.tsx, app/workspace.tsx, app/page.tsx, tests/pending-uploads.test.mjs.

Interfaces: IndexedDB records `{owner,id,folder,kind,file,createdAt}`; `savePending`, `listPending`, `deletePending`, `identifyUpload`. Server-confirmed upload is the only automatic removal trigger.

- [x] Test persisted File/ID restoration, per-owner isolation, transaction abort and successful removal; verify browser reload with synthetic photos.
- [x] Persist site captures immediately before claiming they are saved locally; queue errors stay visible. Rehydrate owner-scoped pending queue after login and provide retry/discard controls.
- [x] Preserve camera orientation and 3-way uploads; track upload IDs on recovered File objects.

## Task 4 — Capacity and scalable library reads

Files: migration 0014, lib/r2-budget.ts, lib/folders.ts, app/api/library/route.ts, new app/api/settings/route.ts, app/storage-settings.tsx, workspace, db/schema.ts.

Interfaces: global settings storage cap defaults to 8GB; admin-key-protected update. Folder count/bytes maintained by triggers. Folder metadata GET is separate from `photosOnly=1&limit=60&cursor=...` pages; stable `(created_at,id)` ordering.

- [x] Assert migration counts match existing active photos, insert/tombstone/delete keeps counts correct, page boundaries contain every ID once, malformed cursor fails.
- [x] Add configurable cap with default preserved and explicit cost acknowledgement for increases; expose usage alerts and a clearly labelled forecast from recent uploads.
- [x] Load folder list separately and page originals; refresh only needed data. Preserve date/address grouping and all-photo ZIP.

## Task 5 — Complete backup/restore and split photo ZIP

Files: lib/backup-format.ts, lib/backup-client.ts, app/backup-tools.tsx, app/api/backup/route.ts, app/api/restore/route.ts, migration 0015, lib/archive-parts.ts, archive UI, tests/backup.test.mjs and backup.integration.mjs.

Interfaces: backup manifest v1 carries folders, photo metadata, schedule sources, drawing drafts and original-file hashes. Browser directory backup writes `manifest.json` only after all original files validate. Restore records staged by job ID, verified objects uploaded once, final publish creates a separate restore region and never overwrites existing IDs.

- [x] Test SHA mismatch, missing files, unknown schema/unsafe file paths, interrupted/retried uploads and owner isolation; full round trip checks metadata, counts and original bytes.
- [x] Implement desktop directory selection and explicit preview/confirmation. Unsupported browsers receive a clear desktop instruction. Cancelled/incomplete jobs support retry or explicit cleanup.
- [x] Split ordinary photo ZIP manifest into bounded parts; download selected parts with fresh tickets, retain complete-path naming and no non-photo content.

## Task 6 — Source hygiene and deployment verification

Files: lib/schedule.ts, lib/folders.ts, synthetic test fixture, scripts/verify.mjs, scripts/deploy-cloudflare.mjs, package.json, eslint config only for documented platform conventions, README/PROJECT/deployment docs.

- [x] Preserve existing DB data; remove real contact seed from source and stop auto-seeding new production accounts. Store any necessary migration source only in ignored local backup. Tests seed explicit synthetic data.
- [x] Resolve application lint errors without disabling correctness rules wholesale. Normalize Python discovery/UTF-8 for Windows test execution.
- [x] `npm run verify` runs type-check, app lint, every unit test, build and integration suites; deployment calls that same gate. Record build source digest/Git revision and deployment version for reproducibility/rollback.
- [x] Run final checks, one fresh whole-change review, address verified regressions and update handoff. Preserve any platform/device test limitations explicitly.

## Execution record

Ruling: the user has already approved the complete review and asked for action, so no repeated plan-approval gate. Native implementation minimizes coordination overhead; security and final reviewers are independent. Ruling: use the existing checkout with dirty baseline preserved, not a HEAD-only worktree that would omit the deployed changes. Progress is recorded in `docs/superpowers/plans/2026-09-23-progress.md` to survive compaction.

Validation qualifications: browser reload recovery was tested; OS-level phone termination/quota and native folder picker tests are recorded as unexecuted device acceptance in the completion report.
