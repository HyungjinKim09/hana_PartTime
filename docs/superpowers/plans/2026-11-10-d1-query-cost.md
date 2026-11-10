# D1 query cost remediation

Goal: reduce verified excessive D1 reads without changing shared-library, attribution, authentication, free-tier guards or download semantics.

Spec: user request to inspect and fix other inefficient paths; incident evidence recorded in CODEX_HANDOFF.md. Production remains unchanged during local work.

Architecture: explicitly materialize scoped folder IDs once per participant lookup, drive indexed evidence joins from those IDs, deduplicate evidence before mapping to cards/date summaries. Add indexes supporting actual predicates. Reuse session verification only inside one request using AsyncLocalStorage, never an HTTP header or a process-wide token cache. Keep authoritative quota reservations and session revocation.

Tech stack: Workers, D1/SQLite, TypeScript, Miniflare integration tests.

Constraints: no paid service or plan upgrade; no real-user fixtures; preserve live/restored/manual attribution priorities and durable contribution history. Existing migration 0021 is pending production; migration order must be respected.

1. Reproduce participant read amplification on 100 folders / 3,000 photos; assert bounded reads and independence from unrelated history. Implement scoped join rewrite and verify provenance/dedup tests.
2. Measure photo pagination and expired-login cleanup; add query-aligned indexes only where measured. Verify page boundaries, kind/deleted filters, owner isolation and rate limit behavior.
3. Trace repeated session lookup. Add request-local verification reuse with tests proving one DB verification per ordinary API request, concurrent account isolation, revocation between requests and refreshed-cookie handling.
4. Fix proven personal-work inclusion of drawing-only activity and avoid reading activity history twice per page where practical. Preserve total/search/pagination and personal report snapshots.
5. Run full verification, obtain one fresh-context whole-patch review, fix material findings, document measured costs and release limitations.

Review focus: authorization cannot be forged through headers; no cross-request cache; CTE joins must stay owner scoped; D1 rows_read must be measured, not inferred from HTTP count. Index write overhead must be justified by read savings. No claims of production improvement until deployed.

Ledger: baseline participant query reads 82,923 rows on 100 folders / 3,000 photos, with only 10 folders selected. EXPLAIN shows owner-wide scans of activity and photos and repeated JSON scope scans. Materializing the existing cohort alone reduces to 12,094 but still scans unrelated photos. Use scoped joins rather than introducing a persistent derived table with complex restore/delete invalidation in this patch. This is a measured narrowing of the earlier summary-table proposal.

Execution ledger:
- Task 1 complete: watched real-DB cost regression fail at 82,923 reads, then pass at 3,305, unchanged with 3,000 unrelated photos added. Existing attribution rules preserved by two-stage ranking.
- Task 2 complete: photo first page failed at 6,031 reads, now 25; subsequent page 26; ZIP manifest 61. Measured login cleanup 5,001→1 and rolling quota reservation 40→21 with real indexes enabled/disabled in an isolated synthetic DB.
- Task 3 complete: request-context unit test failed with 6 verifications instead of 2 concurrent requests. Context reuse now passes; real Worker observer proves 1 verification across preflight/fence/route. Full-suite refresh test then exposed same-token overlap renewal retaining cached null. Added deterministic regression (failed401), invalidation at renewal boundary, rebuilt and passed both session-request and refresh-session integrations. No cross-request identity cache.
- Task 4 complete: added drawing-only fixture; old API returned total5 instead of4. Materialized shared participation and field-photo filter; full my-work integration now passes, including per-person reports after coworker edits.
- Task 5 complete: independent whole-patch review and follow-up same-token correction review have no remaining findings. Initial full verification stopped at the now-resolved renewal regression. Final full verification passed159unit/19integration,type/build,0lint errors13existingwarnings; source SHA ccd65bd09b943e93c887a18d37b642e4ead1a268ff1271ac87079cc244067936. Local0022 applied,4175 restored, existing login/scoped API smoke passed. No production changes or Git push. Detailed results: docs/D1_QUERY_COST_2026-11-10.md.
