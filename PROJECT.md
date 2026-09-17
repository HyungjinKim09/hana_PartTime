# Fieldnote — 사직4구역 현장 사진

## Scope
Private personal archive for the 12 properties on the supplied 2026-09-17 schedule. Mobile photo uploads and desktop viewing share durable server state under the signed-in user's ID. The earlier AI floor-plan idea is out of scope.

## Storage and access
- Keep Sites owner-only; identity is supplied by the trusted Sites dispatcher. Never deploy this worker on an untrusted directly accessible origin without replacing header authentication.
- D1 stores ownership, folder and file metadata; R2 stores original bytes. All read, write, delete and export queries enforce the signed-in user ID.
- The schedule is server-side source, not a public asset. There is no browser-only authoritative storage.
- Uploads are sequential, limited to 20 MB per file, and signature-checked for JPEG, PNG, GIF, WEBP and HEIC/HEIF. HEIC downloads work but browser preview is not guaranteed.
- Photos are hidden with a durable tombstone before deleting their objects; a failed cleanup is safely retryable with the original delete ID.

## Download
Streaming ZIP64 uses the path `사직4구역/2026-09-17/사직동 <번지>/<unique-id>_<filename>`.
Includes all 12 folders, including empty folders. Duplicate filenames cannot overwrite each other. Original bytes are not resized or recompressed. Missing files or size mismatches abort rather than silently omit originals. A concurrent deletion can abort an active export; retry after changes finish.

## Verification
- `node --experimental-strip-types --test tests/zip.test.mjs`: Korean paths, empty folders, original bytes with independent Python ZIP reader, unsafe filenames, missing original and size mismatch.
- Build, then `node tests/storage.integration.mjs`: real local Worker/D1/R2 runtime with isolated temporary test state; upload/list/fetch/export/delete, anonymous rejection, per-user isolation and injected D1 failure recovery.
- `node node_modules/typescript/bin/tsc --noEmit`.
- Supervised browser preview verified the signed-out screen. Authenticated browser UI and WebMCP runtime validation are unavailable without a preview login; production auth was not bypassed for testing. Actual phone/PC UI interaction remains a manual acceptance check.

## User acceptance
Sign in with the same ChatGPT account on phone and PC, open a property folder, upload photos, confirm they appear on PC, choose 전체 다운로드 and unzip. Deployment starts with zero photos; synthetic integration fixtures are not deployed.
