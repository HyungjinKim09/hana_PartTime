# Fieldnote — 사직4구역 현장 사진

## Scope
Private personal archive organized by region → survey date → property schedule. The original 12 properties from 2026-09-17 remain seeded with their original IDs, preserving existing photos. Mobile photo uploads and desktop viewing share durable server state under the signed-in user's ID. The earlier AI floor-plan idea is out of scope.

## Schedule photo import
- Tesseract.js runs Korean/English OCR in the browser. All worker, WASM and language assets are self-hosted under public/ocr. No OpenAI key or additional plugin is required.
- Extracts region, printed survey date and lot-column candidates. User compares and confirms editable fields before submitting. Missing dates are never replaced with the upload date. Time, contact and notes are manually editable; OCR does not claim reliable extraction of these fields.
- Original schedule and validated metadata are uploaded together. R2 original is stored first; a D1 batch creates folders and source metadata atomically, with object cleanup on failed database writes.
- Unique owner/region/date/normalized-lot key merges repeated folders. Existing folder details and photos are preserved. A different date or region creates independent folders.
- Run `node scripts/prepare-ocr.mjs` after changing OCR dependency versions, and commit the generated public assets. Tesseract's optional donation-message postinstall is intentionally disabled.

## Storage and access
- Keep Sites owner-only; identity is supplied by the trusted Sites dispatcher. Never deploy this worker on an untrusted directly accessible origin without replacing header authentication.
- D1 stores ownership, folder and file metadata; R2 stores original bytes. All read, write, delete and export queries enforce the signed-in user ID.
- The schedule is server-side source, not a public asset. There is no browser-only authoritative storage.
- Uploads are sequential, limited to 20 MB per file, and signature-checked for JPEG, PNG, GIF, WEBP and HEIC/HEIF. HEIC downloads work but browser preview is not guaranteed.
- Photos are hidden with a durable tombstone before deleting their objects; a failed cleanup is safely retryable with the original delete ID.

## Download
Streaming ZIP64 uses the path `<region>/<survey-date>/<lot>/<unique-id>_<filename>`. Root, region, date and individual folder downloads are supported. Root/region/date exports also include uploaded schedule originals at the date level.
Includes empty property folders. Duplicate filenames cannot overwrite each other. Original bytes are not resized or recompressed. Missing files or size mismatches abort rather than silently omit originals. A concurrent deletion can abort an active export; retry after changes finish.

## Verification
- `node --experimental-strip-types --test tests/zip.test.mjs`: Korean paths, empty folders, original bytes with independent Python ZIP reader, unsafe filenames, missing original and size mismatch.
- Build, then `node tests/storage.integration.mjs`: real local Worker/D1/R2 runtime with isolated temporary test state; upload/list/fetch/export/delete, anonymous rejection, per-user isolation and injected D1 failure recovery.
- `node node_modules/typescript/bin/tsc --noEmit`.
- `node --experimental-strip-types --test tests/schedule.test.mjs`: printed date extraction, impossible-date rejection, lot normalization and table-column filtering.
- `node tests/ocr-runtime.test.mjs`: actual Korean/English OCR model load and synthetic image recognition; not a claim of accuracy on user photographs.
- Storage integration also checks repeat imports, same lot on different dates, original-photo preservation, schedule originals in ZIP and owner isolation for generated folders.
- Supervised browser preview verified the signed-out screen. Authenticated browser UI and WebMCP runtime validation are unavailable without a preview login; production auth was not bypassed for testing. Actual phone/PC UI interaction remains a manual acceptance check.

## User acceptance
Sign in with the same ChatGPT account on phone and PC, open a property folder, upload photos, confirm they appear on PC, choose 전체 다운로드 and unzip. Deployment starts with zero photos; synthetic integration fixtures are not deployed.
