# Personal Accounts and Work History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 개인별 로그인으로 작업자를 기록하고 기존 팀 자료를 함께 사용한다.
**Architecture:** 공용 owner를 유지하고 개인 계정을 access/refresh 세션에 연결한다. 서버가 작성자 JSON을 기록하고 D1 트리거가 저장과 같은 트랜잭션에서 활동 이력을 만든다.
**Tech Stack:** 기존 React/TypeScript, Cloudflare Workers/D1/R2, Miniflare 통합 검사. 신규 서비스·의존성 없음.
**Spec:** ../specs/2026-10-14-personal-accounts-work-history-design.md

## Global Constraints
- 로컬 구현·합성 계정 검증만 실행. 운영 마이그레이션·배포·Git 업로드 없음.
- owner와 원본 R2 경로 유지. 기존 작성자는 미확인 표시.
- access 15분, refresh 90일. 개인 계정 변경은 해당 계정 세션을 폐기한다.
- 이력 기본50/최대100건, 기존 library 캐시·페이지 조회 유지.
- 비밀번호·토큰·연락처·비고 본문을 이력에 저장하지 않는다.

## Review Focus
- 다른 계정의 미전송 사진 접근: 개인별 보관 범위와 구 공용 관리자 복구.
- 재전송된 업로드: 최초 작업자와 단일 활동 기록 유지.
- revision 충돌/DB 실패: 작성자와 성공 이력이 함께 롤백.
- 사용 중지/재설정 중 refresh 경쟁: access·refresh 둘 다 거부.
- 구형 백업: 작성자 없는 기록도 복원하고 새 작성자 정보는 보존.

### Task 1: 개인 계정·세션
**Files:** drizzle/0018_personal_accounts_activity.sql, db/schema.ts, lib/session-lookup.ts, lib/refresh-sessions.ts, lib/site-auth.ts, lib/storage.ts, app/api/session/route.ts, app/api/members/route.ts, tests/member-auth.integration.mjs.
**Interfaces:** SessionUser={owner,username,displayName,memberId,isAdmin}; identityUser(request?) returns verified SessionUser; identity remains owner wrapper; member API GET/POST/PATCH only administrator.
- [x] Add test: root creates A/B, both login and share owner; worker cannot manage members; deactivation/reset rejects old access/refresh while B stays valid; duplicate root/member usernames rejected.
- [x] Run test against old build and observe failure, implement migration/auth/API, build and rerun.

### Task 2: 작업자 기록과 원자적 이력
**Files:** lib/attribution.ts, lib/upload-receipt.ts, lib/folders.ts, lib/types.ts, app/api/library/route.ts, app/api/schedules/route.ts, app/api/folders/route.ts, app/api/drawings/route.ts, app/api/activity/route.ts, tests/work-attribution.integration.mjs.
**Interfaces:** attribution(user)->JSON string {id,name,at}; parseAttribution(string)->Attribution|undefined; metadata createdBy/updatedBy; activity returns entries,nextCursor and optional actor/action/folder filters.
- [x] Add real API tests: A uploads, B edits; forged actor ignored; duplicate receipt keeps A; conflict and injected DB failure do not create success activity; deletion pending/completion persists and paginated/filter results isolated by owner.
- [x] Observe red, implement stamps and D1 triggers with deterministic event IDs, verify green.

### Task 3: 백업·복원 호환
**Files:** lib/backup-format.ts, app/api/backup/route.ts, lib/restore.ts, app/api/restore/route.ts, tests/backup.integration.mjs.
**Interfaces:** optional createdBy/updatedBy attribution schemas remain backup format1 compatible; publishRestore(db,owner,job,actor?) records restorer separately and preserves source attribution.
- [x] Test old/new manifests, preserve original author and actor-independent credentials exclusion, restore retry produces one completed activity.
- [x] Implement metadata transport and restore event; run backup integration.

### Task 4: 작업자·관리자 화면
**Files:** app/member-management.tsx, app/activity-history.tsx, app/page.tsx, app/login-form.tsx, app/workspace.tsx, app/drawing-editor.tsx, app/report-tools.tsx, app/globals.css.
**Interfaces:** administrator manages accounts; ActivityHistory(folder?) opens paginated filtered dialog; storageScope is owner for administrator and owner/memberId for personnel.
- [x] Add display names, author captions and recent survey/drawing attribution; preserve original responsive priorities and existing mutation cache invalidation.
- [x] Browser verify A/B ownership labels, member admin denial, account manager, history, pending recovery, mobile/desktop overflow.

### Task 5: 전체 검증과 로컬 전달
- [x] Run node scripts/verify.mjs (fresh type/lint/unit/build/all integration).
- [x] Inspect complete diff for missing writes, backup attrs, auth gates, session/owner identity separation.
- [x] Apply local migration to named test persistence, reopen4175 and record screenshots/evidence; no production mutation, push or deployment.
- [x] Update PROJECT/README/handoff and task ledger with actual limitations and results.

## Execution ledger
- Release authorization: user explicitly requested deployment and Git upload on2026-10-14, superseding the completed local-only restriction for this release. Fresh full verification and dry run passed156unit/16integration suites,0lint errors/13existing warnings; exact sourceSHA5cfc2a6ee243b5d0388ffe0bf6393a7aac585df04858f49aafa6f73feec57a7d.
- Release completed: migrations0018/0019/0020 applied remotely; Worker326d4bc7-3325-4547-9767-1abf93325d72 deployed. Production authenticated/anonymous/member-list/my-work/participants/refresh/logout/identity-fence and built-asset matching smoke passed. Shared counts278folders/1191activephotos+drawings/42imports/1draft and root account fingerprint unchanged; all4existing secrets retained. No real file or survey mutations, no production test users, no AI inference. See docs/RELEASE_2026-10-14.md; Git delivery uses existingexternal-cloudflare branch.
- Ruling: user explicitly approved this written design for local implementation; execute inline in the existing project checkout. Preserve user authorization without another implementation permission prompt. Do not publish or push.
- Pre-flight: Tasks1→2→3→4 consume the verified SessionUser and attribution JSON; define those once. Task5 validates all earlier interfaces. The shared owner remains independent from actor ID.
- Ruling: split migrations into0018_personal_accounts.sql and0019_work_activity.sql to verify authentication independently; both remain unapplied to production.
- Review: independent read-only review found stale cross-tab identity/pending scope and conflated schedule/survey attribution. Added an expected-identity request fence, auth-change broadcast and resume check; separate creator/schedule/survey stamps and per-attribution restored provenance. Added real failing regression cases before the fixes. Refresh-versus-member reset/disable now runs concurrently in the auth integration.
- Regression: D1 meta.changes includes trigger activity writes; schedule import counts now use inserted IDs from RETURNING. Updated the login-copy assertion to the approved personal-login wording.
- User extension: explicitly requested own folders and own today report, then chose photo/survey participation and survey_date=today. Extend the existing folder/report flows locally without another authorization prompt. Migration0020 stores per-person latest survey results atomically, supports personal bounded lists and multi-region copy reports, and includes those snapshots in backward-compatible whole backup/restore. No original author is inferred.
- Second review: confirmed transient identity-check failure must preserve unsaved editing state. Keep mounted work shielded, block requests while unverified, and retry; only a confirmed401/different scope/auth broadcast closes the previous workspace. Personal report snapshots are now transported by backup/restore; audit history itself remains D1-only.
- Validation: final node scripts/verify.mjs passed with156unit tests/15integration suites, typecheck/build and0lint errors/13existing warnings. Verified sourceSHA1479cd6482df1e1acb11effb8c94949c8b3f38439d0e9e8e67de47fe26cc39d4; HEAD remainsce3fa2d. Evidence.sites-runtime/personnel-qa/verified-delivery.log anddist/build-provenance.json.
- Browser: administrator management form/list; A/B shared folder access with distinct author captions and member-only menu; actual failed synthetic upload remains A-only in IndexedDB; cross-tab logout closes A's open pending dialog and B has0pending photos. Own-folder list opens the shared detail; today report uses B's own record with3-digit lot formatting.390px report dialog fits the viewport, screenshotstoday-report-desktop/mobile.jpg. The failure proxy confirmed503shows a retry dialog and retry resumes all initial library queries without an empty/error library. App-switch focus events were not reproduced by the in-app automation surface, so preservation of existing unsaved edits on physical phone resume remains a manual-device check.
- Local DB: preserved the original local drawing/test account, copied prior test persistence into ignoredstate-before, applied0018/0019/0020only to.wrangler/drawing-live-qa, added syntheticA/Baccounts andonepersonal-work fixture. Local server4175 remains running with AIbinding removed from the QA config; no paid OCR/AI call, production migration/deploy, product commit or push.
- User extension: display all investigators on date/schedule folders, supporting several people in one shared folder. Enrich scoped library summaries/cards using verified field-photo/survey activity and preserved author metadata, deduplicated by actor ID. Read-only views, scheduling and drawing-only work do not count. Root library retains its lean payload; one bounded query serves all cards on the returned page. Existing local implementation authorization and no-release restriction remain in force.
- Investigator validation: participants-final-verify.log passes156unit/16integration suites, type/lint/build; current source matches verifiedSHA5cfc2a6ee243b5d0388ffe0bf6393a7aac585df04858f49aafa6f73feec57a7d. New real-API regression first failed on missing roster, then passed for multi-person day/detail/card lists, identity deduplication, late/other dates, pagination, owner isolation, restored attribution, and retained contribution after photo deletion. UI tab8 showsA+B(2people) in both date overview and selected detail;390px viewport has equal document/client widths and both names visible. Screenshots participants-detail-desktop.jpg andparticipants-day-mobile.jpg. No new migration, product commit, push, production deployment or real user-data mutation. Local4175execsession95880 retains the same QA persistence/config; temporary viewport reset.
