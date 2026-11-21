# Modern Web Guidance improvements

## Schedule drafts

Schedule creation and photo recognition keep unfinished fields and original sheets in the browser's `hana-schedule-drafts` IndexedDB database. Keys include the authenticated storage scope and manual/photo input mode. A reopened creation dialog restores the unfinished draft. Close and original replacement require confirmation; browser navigation warns about unfinished work. Confirmed saves and explicit discards clear the draft. Browser storage failures are shown to the user.

All draft reads, writes and removals for a key share one queue across dialog instances. Unmount cleanup registers its latest snapshot immediately, so reopening cannot read ahead of it. A completed server submission is remembered separately from local cleanup: failed cleanup stays visible and retries do not submit the schedule again. A persistent browser-storage failure can leave the old local draft; the dialog explicitly reports this rather than claiming cleanup succeeded.

Recognition can be cancelled. The initial service check has a 15-second deadline, remote recognition 75 seconds per sheet, and local OCR five minutes per sheet. Cancellation terminates known local OCR workers and prevents late results replacing the current draft. Retrying uses the selected originals. Existing edits remain available if replacement recognition fails or is cancelled.

Cancellation during image decoding closes the decoded bitmap and prevents starting a new OCR engine. Tesseract exposes the worker only after its initialization promise resolves; an initialization already in progress can therefore be terminated only after that promise resolves. Do not describe this as guaranteed immediate background termination during initialization.

## Photo list previews

The gallery requests `/api/photos/:id?preview=1`. A stored preview is returned when available; otherwise the original remains the fallback. Once a large ordinary photo is displayed, the browser creates a JPEG with a longest edge of 480 pixels, bounded to 64 KiB, and saves it with an authenticated, version-fenced PUT. Small originals and drawings do not need this additional file. Preview generation stays outside the original-upload completion path.

This adds at most 64 KiB of R2 storage per generated preview. Older photos can require one original load before their first preview is available. A preview failure does not invalidate an original upload or prevent viewing the original. The API validates JPEG dimensions and bytes, isolates preview ETags, and keeps attachment downloads on the original representation.

Rotation clears the previous preview and fences concurrent preview installation. Retrying after a conflict uses the latest preview state. Deletion removes both the original and attached preview. Integration coverage checks authentication, ownership, conditional downloads, concurrent creation, interrupted metadata writes, rotation races, and cleanup.

A losing preview writer retains its maintenance marker until R2 deletion succeeds, including during a storage outage. Maintenance fences stale writers and checks published originals and previews before removing objects.

## Pending originals

The `hana-pending-originals` database migrates from v1 to v2 without discarding queued photos. An owner index handles list/count operations; a device-wide usage record replaces repeated full-record scans on saves. Saves and deletions update files and usage atomically. The existing device-wide 200-photo / 512-MiB cap and stable retry IDs remain in effect.

## Forms and preferences

Schedule creation/editing show errors on the relevant field and focus the first invalid control. Controls have explicit labels, field error descriptions, required states, and telephone input hints. A collapsed details section opens when it contains the first error.

User-visible CSS font sizes use rem units. Schedule controls inherit a minimum 1rem font size, narrow forms stack their fields, and coarse-pointer controls have larger targets. Programmatic scrolling observes `prefers-reduced-motion` in both folder navigation and schedule editing.

## Verification

- `node --import ./scripts/sites-env.mjs scripts/verify.mjs`: typecheck, lint, unit tests, production build, and the complete synthetic D1/R2 integration suite.
- `tests/photo-preview-race.integration.mjs` pauses after the rotation snapshot and installs a concurrent preview, then checks conflict/retry and orphan cleanup.
- `tests/photo-preview-failure.integration.mjs` combines concurrent preview creation with a failed R2 delete and checks that healthy maintenance later removes only the unattached object.
- A synthetic browser test forces local draft deletion to fail after a successful server save, then checks that cleanup retry closes the dialog while the actual server POST count stays at one.
- Local browser checks use synthetic accounts and generated photo data; production data is not modified.
- Physical iPhone/Safari camera behavior and storage pressure near the browser quota require device testing.
