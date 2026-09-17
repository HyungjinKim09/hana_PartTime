# Fieldnote — 사직4구역 현장 사진

## Scope
Private personal archive organized by region → survey date → property schedule. The original 12 properties from 2026-09-17 remain seeded with their original IDs, preserving existing photos. Mobile photo uploads and desktop viewing share durable server state under the signed-in user's ID. The earlier AI floor-plan idea is out of scope.

## Schedule photo import
- Tesseract.js runs Korean/English OCR in the browser. All worker, WASM and language assets are self-hosted under public/ocr. No OpenAI key or additional plugin is required.
- Extracts region, printed survey date and numbered-table fields. User compares and confirms editable fields before submitting. Missing dates are never replaced with the upload date. Names, contacts and notes remain editable and require review.
- Original schedule and validated metadata are uploaded together. R2 original is stored first; a D1 batch creates folders and source metadata atomically, with object cleanup on failed database writes.
- Unique owner/region/date/normalized-lot/unit key reuses repeated folders. Same-lot apartments remain separate by building/unit; ambiguous duplicates in one import are rejected, never silently removed. Existing folder details and photos are preserved. The unit migration defaults old rows to an empty unit and retains their IDs.
- Run `node scripts/prepare-ocr.mjs` after changing OCR dependency versions, and commit the generated public assets. Tesseract's optional donation-message postinstall is intentionally disabled.
- OCR repair: resize the page before recognition, detect ruled numbered survey tables and read the heading and individual lot cells independently. Keep unreadable rows as blank review entries with warnings; never infer a missing hyphen. Other layouts fall back to whole-page OCR with an explicit incompleteness warning.
- The heading uses sparse-text segmentation, which fixes the missing region on the supplied Mangmi schedule. Numbered table cells now include name, phone, time, building/address and notes. Mixed Latin/Korean building names receive a review warning. Folders and ZIP paths display building/unit alongside the lot.
- `node --experimental-strip-types tests/photo-ocr.mjs <local-photo> --mangmi` was run against the supplied 2026-09-15 Mangmi photograph: region/date, all 11 lots, 11 unit numbers and 11 time entries match. Row 5's building text misreads A동 as AT and is explicitly flagged. This is not a claim that all contact/name text is accurate. User photographs are not committed or published as assets.
- `node --experimental-strip-types tests/table-ocr.mjs` exercises a synthetic Korean ruled table: all 12 rows remain, 11 readable lots are recognized, and one clipped lot is flagged. The user's failing photo was unavailable in scratch for reproduction; no accuracy claim is made for it.

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
