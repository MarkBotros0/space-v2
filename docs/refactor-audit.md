# Whole-app refactor audit (draft — Phase 1 in progress)

Read-only audit of `space-v2` at `main` @ 4ab858a3 (2026-11-09). Status and next steps live in
`docs/refactor-plan.md`. Findings are in per-area files until they're merged and deduplicated here:

| Area | File | IDs |
|---|---|---|
| Backend code (structure, duplication, layering, errors, N+1, cycles) | `refactor-audit/backend.md` | BE-001…BE-081 |
| Mobile app + `packages/shared` | `refactor-audit/mobile.md` | FE-*, SH-* |
| Dead code, whole repo | `refactor-audit/dead-code.md` | DC-* |
| Database / ERD / indexes | `refactor-audit/database.md` | DB-001…DB-028, IDX-* |

## Headline findings so far

**Size.** Already compliant: no source file over 400 lines (only 4 tests, 423–475). Long functions:
backend 91 of 1,263 over 50 lines (largest `buildEngagementSummary` 207, `duplicateSeason` 172,
`loadForumView` 157); mobile 183 of 3,794 over 50, 7 over 200. Nesting > 3 is rare.

**Layering.** No repository layer: 59 of 76 route files import `db`; 381 `db.`/`tx.` calls in routes
(114 writes), 49 `$transaction` sites in routes vs 4 in lib. Mobile: no queries in screens, but
`src/design` imports hooks/store and `src/components` imports `src/screens` (FE-017).

**Errors.** Four refusal shapes (SeatRefusal objects, `fail:` tuples, string verdicts, 7 local Error
classes), 513 inline `apiError` calls, 24 inline 403s bypassing `forbidden(res)`.

**Duplication.** Backend: 118 parse-id preambles, 131 load-or-404s, `limit+1` pagination ×8 with 5
cursor parsers, two `requireSuper`s. Cross-app: the "finished season" rule spelled ~20 times
(SH-002); ~15 error codes as bare strings on both sides (FE-050); 5 request types re-declared in mobile
(FE-040). Mobile: ~105 `RouteError`/~99 `RouteSkeleton` gates, season-route param boilerplate ×10,
146 `apiClient` + `parse` pairs, 12 hand-rolled form-error blocks.

**N+1.** `lib/attendance-notifications.ts:24-82` (up to 6 queries per absent student);
`lib/queries/forum.ts:232,282` (permission re-read per comment); `lib/queries/assignments/staff.ts:38-45`.

**Cycles.** One: `lib/storage/index.ts` ↔ `local.ts`. Mobile: none.

**Dead code.** 5 mobile files, ~13 dead symbols, 119 unused exports (103 types), 18 used only by
tests, `AUTH_URL` in `turbo.json`, `IMPORT_FILE_UPLOAD_SUPPORTED`, the S3 stub, 13 routes without a
mobile caller (owner decides). `tsc --noUnusedLocals` is clean.

**Database.** Dead columns (7 on StudentProfile, `Season.coverImagePath`, `Session.materialsPath`,
`JpcEvent.imagePath`), unused `StudentDocument` table, write-less `User.avatarPath`; case-sensitive
email unique vs case-insensitive lookups (DB-004); no retention on RefreshToken/Notification (DB-007);
`GroupStudent` duplicates `SeasonEnrollment.groupId` (DB-012); rules only in code (DB-014, DB-019);
25 FKs without an index (one hot: `SeasonEnrollment(groupId, status)`), one redundant index
(`GroupStudent_groupId_idx`); 153 manual `deletedAt` filters, 27 hard deletes. Also: 36 models, all `Int` autoincrement PKs (no UUIDs, so
no UUID exceptions); `deletedAt` only on User, StudentProfile, Season, Assignment; 5 link tables with
composite PKs (SeasonAdmin, GroupLeader, GroupStudent, AssignmentTarget, AnnouncementRead).
