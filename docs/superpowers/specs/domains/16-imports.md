# Domain 16 — Imports

> Status: draft · Phase: 5 · v1 API status: none

Bulk data entry. Two importers, not three: a **student/profile importer**
(SUPER, mounted on the users surface) and a **group-assignment importer**
(season admin, mounted on the roster surface). Both read a spreadsheet, show a
row-by-row preview, and then commit. Neither exists in v2 in any form.

The domain owns **parsing, matching, batching and the preview/commit protocol**.
It does not own the write rules for the rows it creates: `User` and
`StudentProfile` belong to domain 6 (students), `SeasonEnrollment` to domain 6,
`GroupStudent` to domain 5 (groups), invites to domain 11. Where this spec
states a write rule it is because the importer reaches the database directly and
bypasses those domains' own actions — which it does, once, and that is recorded
below (R46).

Every citation is a path under `D:\Projects\JPC\jpc-space` unless prefixed with
`apps/` or `packages/`, which are `D:\Projects\JPC\space-v2`.

---

## 1. v1 source

The split the brief asked about is real and clean, with one exception.
`*-import.ts` is **pure**: parsing, validation, matching, and the row
classification that drives the preview. `*-import-actions.ts` is the
`"use server"` boundary: authorization, file intake, and the commit. The
exception is that `student-import.ts` is not purely pure — it holds
`commitStudentImport`, which writes (`src/lib/student-import.ts:231-292`), and
its preview reads the database to classify rows (`:156-168`). `group-import.ts`
is genuinely read-only.

| File | Holds |
|---|---|
| `src/lib/spreadsheet.ts` | The whole file-format layer: `SpreadsheetParseError`, `cellText` (cell → string coercion), `loadFirstWorksheet` (CSV vs XLSX branch). 37 lines, zero database access, **the part that ports unchanged** |
| `src/lib/student-import.ts` | Student importer. Column alias table, row schemas, `buildImportPreview` (parse + classify + existence lookup), `toStudentProfileData`, `ImportMode`, and `commitStudentImport` (the row loop that writes) |
| `src/lib/student-import-actions.ts` | `previewStudentImportAction` (SUPER gate, extension + size check, buffer, delegate) and `commitStudentImportAction` (SUPER gate, discriminated-union schema, season liveness check, delegate, revalidate) |
| `src/lib/group-import.ts` | Group-assignment importer. `buildGroupImportPreview` — header scan, roster and group lookup, five-way row classification. Pure read; no writes |
| `src/lib/group-import-actions.ts` | `previewGroupImportAction` (season-admin gate, extension + size check) and `commitGroupImportAction` (season-admin gate, delegates to the groups domain) |
| `src/lib/group-actions.ts:183-248` | `assignStudentsToGroupsAction` — the actual write the group importer commits through. Shared with the manual roster grid. Owned by domain 5 |
| `src/lib/groups-query.ts:128-163` | `listGroupsForSelect` and `listSeasonRoster` — the two lookups that define what the group importer can match against |
| `src/components/users/student-import-form.tsx` | The student import client. **Holds the entire parsed preview in React state** (`:62`) and reconstructs the commit payload from it (`:102-113`). Also hosts the post-import invite button |
| `src/components/groups/group-import-form.tsx` | The group import client. Same pattern: preview in state (`:32`), commit payload rebuilt from it (`:64-66`) |
| `src/components/ui/file-upload.tsx` | Drag-and-drop file input. Client-side size check (`:32-38`), `accept` attribute, single/multiple mode. The only file picker in v1 |
| `src/components/ui/data-table.tsx` | Renders the preview grid. Four columns on both importers |
| `src/app/super/users/import/page.tsx` | SUPER page. `requireRole(user, ["SUPER"])` at `:11`; loads the non-deleted season list for the target picker at `:13-17` |
| `src/app/admin/season/[code]/roster/import/page.tsx` | Season-admin page. `requireRole(user, ["ADMIN","SUPER"])` at `:21`, then `canEditSeason` redirect at `:24` |
| `src/app/super/users/page.tsx:59` | The only link to the student importer |
| `src/app/admin/season/[code]/roster/page.tsx:42` | The only link to the group importer |
| `src/lib/invite-actions.ts:41-51` | `sendInvitesAction` — the separate, explicitly-clicked follow-up to a student import |
| `src/lib/season-export.ts:106,130,158` | Not part of this domain (17 owns it) but shares `spreadsheet.ts` and defines the header row an operator is most likely to feed back in — see D14 |

v1 has **no test files**; the source above is the entire statement of intent.
The brief's third importer ("users") does not exist as separate code — the
`/super/users/import` page is the student importer with a `graduationYear`
target instead of a season (`src/lib/student-import.ts:227-229`). There is no
importer for staff, leaders, admins, sessions, attendance, or grades.

---

## 2. Data model

Models named exactly as `apps/backend/prisma/schema.prisma` (verified byte-identical
to v1's `prisma/schema.prisma`) names them.

### `User` (`prisma/schema.prisma:103-160`)

| Field | Meaning / rule dependency |
|---|---|
| `email` | `@unique`, plain `String` — **no `citext`, no lowercase normalisation anywhere in v1**. This column is the entire identity/idempotency mechanism for the student importer. See R29, D2 |
| `name` | `String`, **not null**. The importer requires ≥2 characters (R24, R41) |
| `role` | Import always writes `STUDENT` (R47). No importer can create any other role |
| `passwordHash` | Nullable. Import writes `null` — the account exists but cannot be logged into until an invite is accepted (R47) |
| `graduationYear` | Nullable. Alumni mode writes it; season mode writes explicit `null` (R48). Doubles as the "is an alumnus" marker (`src/lib/rbac.ts:20-22`) |
| `deletedAt` | Soft delete. **Neither importer filters on it** — see R28, D6 |
| `lastLoginAt`, `avatarPath` | Never touched by import |

`User` has **no `createdById`/`updatedById` audit columns** (`prisma/schema.prisma:103-160`),
so there is no record anywhere of which operator imported which account. `createdAt`
is the only trace. See D15.

### `StudentProfile` (`prisma/schema.prisma:214-237`)

Created in the same statement as the `User` via a nested `create`
(`src/lib/student-import.ts:261-263`). Fields the importer can populate:
`activeSeasonId`, `phone`, `university`, `year`, `dateOfBirth`,
`spiritualBackground`, `gifts`, `notes`. It never writes `photoPath` or
`deletedAt`.

`year` is `String?`, not an integer — a "Year" column is stored verbatim
("2nd", "Year 3") with a 50-character cap (R41).
`dateOfBirth` is `DateTime?` in a schema with **no timezone column anywhere**;
see R50 and D8.

### `SeasonEnrollment` (`prisma/schema.prisma:339-357`)

`@@unique([studentUserId, seasonId])` (`:355`). The student importer *creates*
a row with `status: ACTIVE` and no `groupId` (R48). The group importer *upserts*
the same row to set `groupId`, creating it with the default `ACTIVE` status if
the student had none (R78). Two importers therefore write the same table by two
different mechanisms.

### `GroupStudent` (`prisma/schema.prisma:327-337`)

`studentUserId` is `@unique` **standalone**, not as part of the composite key —
a student is in at most one group system-wide, across all seasons. This is why
the group importer's write deletes every existing membership before creating the
new one (R77). The student importer never touches this table (R49).

### `Group` (`prisma/schema.prisma:297-311`)

`name` is a plain `String` with **no unique constraint**, not even scoped to the
season. The group importer keys a `Map` on the lower-cased name (R65).

### Nullable-in-schema, treated as required in code

- `RosterStudent.name` is typed `string | null` (`src/lib/groups-query.ts:138`)
  although `User.name` is not-null in the schema (`prisma/schema.prisma:106`).
  Harmless, but a v2 contract must not copy the nullable typing.

### Fields written but never read back by this domain

- `SeasonEnrollment.status` — written `ACTIVE` at `src/lib/student-import.ts:269`
  and defaulted at `src/lib/group-actions.ts:239`, but neither importer ever
  reads an enrollment. Eligibility for the group importer is decided by
  `StudentProfile.activeSeasonId`, not by enrollment (R61).

---

## 3. Business rules

### File intake — shared by both importers

- **R1.** Both importers accept exactly two extensions, `.csv` and `.xlsx`, matched by a case-insensitive suffix test on the client-supplied filename — `src/lib/student-import-actions.ts:19,32-35`; `src/lib/group-import-actions.ts:13,28-31`. `.xls`, `.ods`, `.tsv` and `.numbers` are all rejected.
- **R2.** *(implicit)* The filename extension is the **only** format gate — no MIME check, no magic-byte sniff — and it also selects the parser branch, so a CSV renamed `.xlsx` fails inside ExcelJS rather than at the gate — `src/lib/spreadsheet.ts:29-36`.
- **R3.** Server-side size ceiling is 5 MB, checked **after** the whole file has already reached the server action — `src/lib/student-import-actions.ts:18,36`; `src/lib/group-import-actions.ts:12,32`.
- **R4.** The client enforces the same 5 MB independently and sets `accept=".csv,.xlsx"` on the input — `src/components/ui/file-upload.tsx:32-38`; `src/components/users/student-import-form.tsx:294`; `src/components/groups/group-import-form.tsx:128`.
- **R5.** Exactly one file per import: `FileUpload` is used without `multiple`, and the actions read only `formData.get("file")` — `src/components/users/student-import-form.tsx:76`; `src/lib/student-import-actions.ts:29`; `src/lib/group-import-actions.ts:26`.
- **R6.** Only the **first** worksheet is read. Additional sheets are ignored without a warning — `src/lib/spreadsheet.ts:33,36`.
- **R7.** CSV parsing deliberately forces every cell to raw text through an identity `map`, to preserve a leading `+` and leading zeros in phone numbers — `src/lib/spreadsheet.ts:29-34`, with the reason stated in the comment at `:30-32`.
- **R8.** XLSX parsing applies **no** such protection — `src/lib/spreadsheet.ts:35-36`. A phone number stored as a number in Excel arrives as `String(number)` via R9 and loses exactly what R7 exists to protect. The same data gives two different answers depending on which of the two accepted formats it is saved in. See D7.
- **R9.** `cellText` coerces a cell to a string by this precedence: `null`/`undefined` → `""`; string verbatim; number/boolean via `String()`; `Date` via `toISOString()`; object with `text` → that text; object with `hyperlink` → the target with a leading `mailto:` stripped; object with `result` → recurse into the cached formula result; object with `richText` → the parts concatenated; anything else → `""` — `src/lib/spreadsheet.ts:6-22`.
- **R10.** *(implicit)* Because `hyperlink` is checked before `richText` and after `text`, an email cell that Excel auto-linked resolves to the link target, which may differ from what the operator sees in the sheet — `src/lib/spreadsheet.ts:12-15`.
- **R11.** Row 1 is always the header row; data rows run from row 2 to `sheet.rowCount` inclusive — `src/lib/student-import.ts:96,115`; `src/lib/group-import.ts:44,62`. There is no "skip N leading rows" option and no way to import a headerless file.
- **R12.** Header matching is `trim().toLowerCase()` **exact equality** against a fixed vocabulary. No fuzzy matching, no punctuation stripping, no tolerance for internal whitespace — `src/lib/student-import.ts:97-103`; `src/lib/group-import.ts:45-48`.
- **R13.** *(implicit)* Columns are recorded by their true sheet index (the `col` argument of `eachCell`), not by their ordinal among non-empty headers, so an empty header cell does not shift later columns — `src/lib/student-import.ts:96`; `src/lib/group-import.ts:44`.
- **R14.** A parse failure raised as the importer's own error type surfaces its message to the operator verbatim; every other exception is logged server-side and replaced with a generic "Could not read that file" message — `src/lib/student-import-actions.ts:42-46`; `src/lib/group-import-actions.ts:38-42`. The two importers use two *different* error classes for the same purpose: `ImportParseError` (`src/lib/student-import.ts:7`) and `SpreadsheetParseError` (`src/lib/spreadsheet.ts:4`).

### Student importer — parse and preview

- **R15.** Required headers are `name`, plus `email` **or** `e-mail`. Missing either aborts the whole file with `'The file needs a header row with "name" and "email" columns.'` — `src/lib/student-import.ts:98-99,105-107`.
- **R16.** Seven optional profile columns are recognised through a 19-key alias table — `src/lib/student-import.ts:24-42`. The full column schema is tabulated below.
- **R17.** *(implicit)* On duplicate headers the behaviour differs by column kind: `name` and `email` are assigned unconditionally so the **last** matching column wins, while a profile column is guarded by a "not already claimed" test so the **first** wins — `src/lib/student-import.ts:98-102`.
- **R18.** Any header outside that vocabulary is silently ignored — there is no unrecognised-column warning anywhere in the preview — `src/lib/student-import.ts:100-103`. See D11.
- **R19.** `detectedColumns` is display-only: the literals `"Name"` and `"Email"` followed by the canonical label of each matched profile column, in sheet order — `src/lib/student-import.ts:44-52,109`, rendered at `src/components/users/student-import-form.tsx:320-322`.
- **R20.** A row is skipped entirely — not counted, not shown, not numbered — only when name, email **and every** matched profile cell are blank — `src/lib/student-import.ts:120-127`.
- **R21.** Every cell value is trimmed; an empty profile cell is omitted from the row's profile object rather than stored as an empty string — `src/lib/student-import.ts:117-124`.
- **R22.** A preview row carries exactly one of four statuses: `new`, `exists`, `duplicate`, `invalid` — `src/lib/student-import.ts:9`. The classification order is invalid → duplicate → new, with `exists` applied afterwards as a second pass.
- **R23.** `invalid` when the trimmed name is shorter than 2 characters **or** the email fails `z.string().trim().email()`. The message names only the first of the two failures — `src/lib/student-import.ts:69,129-139`.
- **R24.** No maximum-length validation runs at preview time. The 120/50/200/50/40/2000/2000/2000 bounds live in the commit-side schemas only — `src/lib/student-import.ts:71-87` versus `:129`. A 300-character name previews green and fails at commit. See D12.
- **R25.** *(implicit)* `duplicate` means the exact email string has already appeared earlier in this file. Matching is **case-sensitive** and no normalisation is applied — `src/lib/student-import.ts:112,140-151`. `A@x.com` and `a@x.com` in the same file are two distinct `new` rows.
- **R26.** `exists` is applied by one batched `findMany` over the whole candidate email set after the row loop, so the preview is not N+1 — `src/lib/student-import.ts:156-168`.
- **R27.** *(implicit)* That existence lookup carries **no `deletedAt: null` filter**, so a soft-deleted user's email still reads "Already in the system" and the row is excluded from import — `src/lib/student-import.ts:157-159`. See D6.
- **R28.** *(implicit)* Existence is matched by exact string equality against a case-sensitive Postgres unique column — `prisma/schema.prisma:105` with `src/lib/student-import.ts:158`. It does not agree with the group importer, which matches case-insensitively (R60). See D2.
- **R29.** *(implicit)* Existence is **global, not season-scoped**. The preview action's signature takes only the file — no season, no graduation year — so `exists` can never mean "already enrolled in the target season" — `src/lib/student-import-actions.ts:25`. The operator picks the target *before* previewing in the UI (`src/components/users/student-import-form.tsx:221-291`) but that choice is not sent until commit.
- **R30.** Counts are a tally over the final statuses, with `total = rows.length` — blank rows skipped by R20 are excluded from `total` — `src/lib/student-import.ts:170-172`.
- **R31.** The preview response carries **every parsed row in full**, including name, email and all profile fields, to the browser — `src/lib/student-import.ts:54-67`, consumed and stored at `src/components/users/student-import-form.tsx:97`.

#### Student importer column schema

Header matching per R12: `trim().toLowerCase()` exact equality on any of the accepted headers.

| Column | Accepted headers (lower-cased) | Required | Target | Type | Validation |
|---|---|---|---|---|---|
| Name | `name` | **Yes** — file rejected if absent | `User.name` | string | ≥2 chars at preview (`:129`); 2–120 chars at commit (`:84`) |
| Email | `email`, `e-mail` | **Yes** — file rejected if absent | `User.email` | string | trimmed, `z.email()` at preview (`:69`) and again at commit (`:85`); duplicate-in-file → `duplicate`; already a `User` → `exists` |
| Mobile No | `phone`, `mobile`, `mobile no`, `mobile no.`, `mobile number`, `phone number` | No | `StudentProfile.phone` | string | trimmed, ≤50 at commit (`:73`); never validated as a phone number |
| University | `university`, `college` | No | `StudentProfile.university` | string | trimmed, ≤200 (`:74`) |
| Year | `year` | No | `StudentProfile.year` | string | trimmed, ≤50 (`:75`). Stored as text, not a number |
| Date of birth | `date of birth`, `dob`, `birthdate`, `birth date` | No | `StudentProfile.dateOfBirth` | string → `DateTime` | trimmed, ≤40 chars (`:76`), then `new Date(string)`; an unparseable value is **dropped silently**, not rejected (`:209-210`) |
| Spiritual background | `spiritual background` | No | `StudentProfile.spiritualBackground` | string | trimmed, ≤2000 (`:77`) |
| Gifts | `gifts`, `spiritual gifts` | No | `StudentProfile.gifts` | string | trimmed, ≤2000 (`:78`) |
| Notes | `notes` | No | `StudentProfile.notes` | string | trimmed, ≤2000 (`:79`) |

Alias table at `src/lib/student-import.ts:24-42`; labels at `:44-52`; preview
validation at `:129`; commit validation at `:71-87`.

There is **no** column for role, password, group, avatar, enrollment status,
graduation year, or active season. Role is fixed (R47); graduation year and
season come from the form, not the file (R37).

### Student importer — commit

- **R32.** **Commit does not re-read the file.** The client posts back a rows array it has been holding in React state since the preview; the server retains nothing between the two calls — `src/components/users/student-import-form.tsx:62,102-113`; `src/lib/student-import-actions.ts:85-87`. This is the crux of the mobile problem — see §10.
- **R33.** Only rows the **client** classified `new` are posted; `exists`, `duplicate` and `invalid` rows are filtered out in the browser — `src/components/users/student-import-form.tsx:102-104`.
- **R34.** *(implicit)* The commit action accepts **any** name/email/profile rows, subject only to shape validation. It does not verify that a preview ever happened, that the rows came from a file, or that the client's classification was honest — `src/lib/student-import-actions.ts:51-79,91-92`. **The preview is advisory.** See D1.
- **R35.** Batch size is 1–2000 rows; there is no pagination or chunking — `src/lib/student-import-actions.ts:69-70`.
- **R36.** Two mutually exclusive modes, expressed as a discriminated union: `season` (a positive integer `seasonId`) and `alumni` (an integer `graduationYear` from 1990 to the current year) — `src/lib/student-import-actions.ts:72-79`.
- **R37.** The mode target comes from the form, never from the file, and applies to **every** row uniformly — `src/components/users/student-import-form.tsx:109-113`; `src/lib/student-import.ts:227-229`. A single file cannot mix seasons or mix students and alumni.
- **R38.** *(implicit)* `CURRENT_YEAR` is captured once at module load — `src/lib/student-import-actions.ts:49`. A long-lived server process caps the alumni graduation year at the year the process booted. The client has the same bug independently at `src/components/users/student-import-form.tsx:54`.
- **R39.** Season mode re-reads the season with `deletedAt: null` and refuses the whole import if it is gone; alumni mode performs no further lookup — `src/lib/student-import-actions.ts:94-99` versus `:109-112`.
- **R40.** *(implicit)* That season lookup checks **liveness only, not scope** — it does not verify the caller administers the season. It is safe today solely because the action is SUPER-gated — `src/lib/student-import-actions.ts:88-89,94-99`. See D3.
- **R41.** Commit-side per-row validation is stricter than preview: name 2–120, valid email, and the profile maxima in the column table above — `src/lib/student-import.ts:71-87,239`.
- **R42.** A row failing that validation is recorded `failed` with `"Invalid name or email."` and the loop **continues to the next row** — `src/lib/student-import.ts:239-243`.
- **R43.** Before each insert, commit re-checks existence with a fresh `findUnique` by exact email — again with **no `deletedAt` filter** — and a hit is recorded `skipped` — `src/lib/student-import.ts:247-251`.
- **R44.** **On a match the importer skips. It never updates and never duplicates.** There is no upsert, no merge, and no way to make an import modify an existing user or profile — `src/lib/student-import.ts:248-251`. This is the domain's idempotency rule: re-running the same file is safe and is a no-op, and it is also why a returning student cannot be bulk-enrolled into a new season (D4).
- **R45.** **The import as a whole is not transactional.** The commit is a sequential `for` loop; each row opens its own transaction. Row 40 of 100 failing leaves rows 1–39 committed and the loop proceeds to row 100 — `src/lib/student-import.ts:238,253-273,276-283`.
- **R46.** Each **row** is atomic: one transaction covers the `User` insert, the nested `StudentProfile` create, and (season mode) the `SeasonEnrollment` insert — `src/lib/student-import.ts:253-273`. This is the point at which the importer bypasses domain 6's own `createStudentAction`, which sets a temporary password instead (`src/lib/student-actions.ts:94`) — the two paths produce differently-initialised accounts.
- **R47.** Created users are always `role: STUDENT` with `passwordHash: null` — the account exists but cannot be logged into until an invite is accepted — `src/lib/student-import.ts:258,260`, with the login-side consequence at `src/lib/auth/credentials.ts:25`.
- **R48.** Season mode writes `StudentProfile.activeSeasonId = seasonId`, `graduationYear = null`, and creates a `SeasonEnrollment` with `status: ACTIVE`. Alumni mode writes `graduationYear` and creates **neither** an active season nor an enrollment — `src/lib/student-import.ts:212,259,262,267-271`.
- **R49.** *(implicit)* No import ever creates a `GroupStudent` row or sets `SeasonEnrollment.groupId` — the season-mode enrollment's `data` object omits it (`src/lib/student-import.ts:269`). Group placement is the second importer's job.
- **R50.** `dateOfBirth` is parsed with the bare `new Date(string)` constructor and an `Invalid Date` is dropped silently — the row still imports, minus its birth date — `src/lib/student-import.ts:209-210`. Contrast `src/lib/student-actions.ts:29`, which uses `z.coerce.date()` and would surface the failure. See D8.
- **R51.** Empty-string profile values are coerced to `undefined` and therefore left NULL rather than written as `""` — `src/lib/student-import.ts:212-219`.
- **R52.** A `P2002` unique violation raised by the insert is caught and downgraded to `skipped` with the same message the pre-check produces, making the check-then-insert race indistinguishable from a clean skip — `src/lib/student-import.ts:198-205,277-278`.
- **R53.** Any other error is logged server-side **with the email address** and recorded `failed`; the loop continues — `src/lib/student-import.ts:280-282`.
- **R54.** The result is a per-row outcome list (`created` | `skipped` | `failed`, with `userId` on created rows) plus three tallies — `src/lib/student-import.ts:181-196,286-291`. Nothing durable is written; if the operator navigates away the report is gone.
- **R55.** Import sends **no invite and no notification**. Invites are a separate action the operator clicks afterwards, over the `userId`s the commit returned — `src/components/users/student-import-form.tsx:126-142`; `src/lib/invite-actions.ts:41-51`. The success panel says so explicitly (`src/components/users/student-import-form.tsx:179-183`).

### Group importer — parse and preview

- **R56.** Required headers are `email` (or `e-mail`) and `group`; `name` is optional and read for display only — `src/lib/group-import.ts:44-52`, stated to the operator at `src/components/groups/group-import-form.tsx:130-132`.
- **R57.** A row is skipped entirely when both email and group are blank. Unlike the student importer (R20), a row carrying only a name is skipped — `src/lib/group-import.ts:64-67`.
- **R58.** A preview row carries exactly one of five statuses: `assign`, `unchanged`, `no_student`, `no_group`, `invalid` — `src/lib/group-import.ts:6`. Classification order is invalid → no_student → no_group (blank) → no_group (unknown) → unchanged → assign.
- **R59.** `invalid` when the email fails validation. The name is never validated — `src/lib/group-import.ts:31,69-72`.
- **R60.** Students are matched to the season roster by **lower-cased** email — case-insensitive, directly contradicting the student importer's case-sensitive matching (R28) — `src/lib/group-import.ts:58,73`.
- **R61.** *(implicit)* The candidate roster is defined by `listSeasonRoster`: `StudentProfile.activeSeasonId = seasonId`, profile not soft-deleted, user not soft-deleted — `src/lib/groups-query.ts:143-148`. Eligibility is the **active-season pointer**, not `SeasonEnrollment`. A student with an ACTIVE enrollment whose `activeSeasonId` points elsewhere is invisible to this importer.
- **R62.** An email not on that roster → `no_student`, "No student with this email in this season." — `src/lib/group-import.ts:73-84`.
- **R63.** A blank group cell → `no_group`, "No group specified." — `src/lib/group-import.ts:85-88`.
- **R64.** Groups are matched by `trim().toLowerCase()` name among the groups of that season only — `src/lib/group-import.ts:59,89`; candidate set from `src/lib/groups-query.ts:128-134`.
- **R65.** *(implicit)* `Group.name` has no uniqueness constraint of any kind (`prisma/schema.prisma:297-311`), and the lookup is a `Map` built by iteration, so when two groups in a season have case-insensitively equal names the **last** one silently wins every row — `src/lib/group-import.ts:59`.
- **R66.** An unknown group name → `no_group`, with the name echoed back into the message — `src/lib/group-import.ts:89-100`.
- **R67.** A student already in the named group → `unchanged`; the row still carries its resolved ids, but the client filters it out before commit — `src/lib/group-import.ts:101-113` with `src/components/groups/group-import-form.tsx:65`.
- **R68.** Everything else is `assign`, carrying the resolved `studentUserId` and `groupId` — `src/lib/group-import.ts:114`.
- **R69.** The importer can only **move** a student between groups. A blank group cell is `no_group` (R63), not an unassign — even though the underlying write action explicitly accepts `groupId: null` — `src/lib/group-import.ts:85-88` versus `src/lib/group-actions.ts:194,231-235`. See D10.
- **R70.** *(implicit)* The `student.groupId` that drives the `unchanged` test comes from a `GroupStudent` lookup restricted to groups **in this season** — `src/lib/groups-query.ts:151-155`. A student whose only membership is in another season's group therefore reads as ungrouped and classifies `assign`, and the commit then deletes that other-season membership (R77).
- **R71.** Preview counts are a tally over the five statuses plus `total = rows.length` — `src/lib/group-import.ts:117-119`.

#### Group importer column schema

| Column | Accepted headers (lower-cased) | Required | Used for | Type | Validation |
|---|---|---|---|---|---|
| Email | `email`, `e-mail` | **Yes** — file rejected if absent | Matching a roster student | string | trimmed, `z.email()` (`:31,69`); lower-cased for the lookup (`:73`) |
| Group | `group` | **Yes** — file rejected if absent | Matching a season group by name | string | trimmed (`:66`), lower-cased for the lookup (`:89`); blank → `no_group`; unknown → `no_group` |
| Name | `name` | No | Display in the preview only — never written, never validated | string | trimmed (`:64`) |

Header scan at `src/lib/group-import.ts:44-49`; requirement check at `:50-52`.

### Group importer — commit

- **R72.** The commit posts back only resolved `{ studentUserId, groupId }` pairs, filtered client-side to `assign` rows. No file, no emails, no names — `src/components/groups/group-import-form.tsx:64-71`.
- **R73.** *(implicit)* Same advisory-preview hole as R34: the action accepts any 1–2000 id pairs and never checks they originated from a preview — `src/lib/group-import-actions.ts:45-51,61-62`. Unlike the student importer, though, the **downstream write is genuinely gated** (R74, R75), so the blast radius is bounded.
- **R74.** The commit delegates entirely to `assignStudentsToGroupsAction` — the same action the manual roster grid uses — `src/lib/group-import-actions.ts:64`. The importer contributes no write logic of its own.
- **R75.** That action re-validates that **every** target group belongs to the season and refuses the **whole batch** if any does not — `src/lib/group-actions.ts:203-213`.
- **R76.** *(implicit)* It re-validates that each student's `activeSeasonId` is the season and **silently skips** the ones that are not — no error, no entry in any report — `src/lib/group-actions.ts:215-223,228`.
- **R77.** Per student the write is: delete **every** existing `GroupStudent` row for that user (unscoped by season, because the column is globally unique), then create the new membership — `src/lib/group-actions.ts:229-235` with `prisma/schema.prisma:329`.
- **R78.** Each assignment also upserts `SeasonEnrollment(studentUserId, seasonId)` to set `groupId`, creating the enrollment with the default `ACTIVE` status when none existed — `src/lib/group-actions.ts:236-240`.
- **R79.** **The group import is transactional.** The entire assignment loop runs inside one `$transaction` with a 20-second timeout — all rows apply or none do — `src/lib/group-actions.ts:225-244`. This is the opposite of the student importer (R45).
- **R80.** *(implicit)* The reported "assigned" count is the **requested** array length, not the number actually written — students skipped by R76 are counted as assigned — `src/lib/group-import-actions.ts:66`, surfaced to the operator at `src/components/groups/group-import-form.tsx:80,111-113`. See D5.
- **R81.** The 20-second transaction timeout is the effective ceiling on batch size: 2000 rows × three statements each inside one transaction — `src/lib/group-actions.ts:243` with the 2000-row cap at `src/lib/group-import-actions.ts:50`.
- **R82.** Neither importer sends a notification of any kind — `src/lib/group-actions.ts:225-247`; `src/lib/student-import.ts:231-292`.
- **R83.** Cache revalidation is one path each: the student importer revalidates `/super/users` (both modes), the group importer revalidates `/admin/season` via the delegated action — `src/lib/student-import-actions.ts:105,113`; `src/lib/group-actions.ts:246`. The season roster page's own path is never revalidated after a group import.
- **R84.** *(implicit)* Neither importer is rate-limited, debounced, or guarded against concurrent runs. Two operators previewing and committing the same file simultaneously both see every row as `new`, and both commits race; R52 turns the loser's rows into `skipped` for the student importer, while the group importer's last writer simply wins — `src/lib/student-import.ts:247-278`; `src/lib/group-actions.ts:225-244`.

---

## 4. Authorization

Role gates are pure functions over the token's claims (`src/lib/rbac.ts`);
row-scoped gates need a database read (`src/lib/auth/permissions.ts`). Note that
`isAdminOfSeason` is **claims-only** — it reads `seasonAdminIds` from the JWT —
so every gate in this domain is a role gate despite reading like a scope check.

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| Open the student-import page | SUPER | none | `src/app/super/users/import/page.tsx:10-11` |
| Preview a student import | SUPER | none | `src/lib/student-import-actions.ts:26-27` |
| Commit a student import (season mode) | SUPER | season must exist and not be soft-deleted — **but not that the caller administers it** | `src/lib/student-import-actions.ts:88-89,94-99` |
| Commit a student import (alumni mode) | SUPER | none | `src/lib/student-import-actions.ts:88-89,109-112` |
| Send invites for the imported batch | SUPER | none — accepts any user-id list | `src/lib/invite-actions.ts:42-43` |
| Open the group-import page | ADMIN, SUPER | `canEditSeason(user, season.id)` else redirect to `/admin/season` | `src/app/admin/season/[code]/roster/import/page.tsx:21,24` |
| Preview a group import | ADMIN of that season, or SUPER | `isAdminOfSeason(user, seasonId)` — **claims-only**, from a client-supplied `seasonId` | `src/lib/group-import-actions.ts:23-24` |
| Commit a group import | same | `isAdminOfSeason(user, input.seasonId)` — **claims-only**, from a client-supplied `seasonId` | `src/lib/group-import-actions.ts:58-59` |
| The underlying assignment write | same | re-checks every group ∈ season and every student's `activeSeasonId` = season | `src/lib/group-actions.ts:196-197,203-223` |

**Where v1 enforces nothing and relies on the UI.**

- **The commit actions trust the client's row payload entirely (R34, R73).**
  This is the batch's headline implicit-gate pattern in its bulk form — but note
  precisely *what* is unguarded. It is not the role gate: both commits check the
  role, and the group importer's underlying write independently re-derives every
  scope it needs (R75, R76). What is unguarded is the **provenance and honesty
  of the rows**. A caller can skip the preview entirely and post any payload the
  schema accepts. For the group importer this is contained: the worst a season
  ADMIN achieves is assigning their own season's students to their own season's
  groups, which they can already do from the roster grid. For the **student**
  importer it is a SUPER creating users, which SUPER may do anyway. **So this
  domain is, unusually, not sitting on an authorization hole — it is sitting on
  an integrity hole.** The rule that matters in v2 is: do not widen either
  commit endpoint's role gate on the assumption that a preview happened.

- **`isAdminOfSeason` reads the token, not the database**
  (`src/lib/rbac.ts:28-30`). An admin removed from a season keeps bulk-write
  access to its roster until their token refreshes. Cross-domain — belongs to
  domain 1/11, recorded here because a bulk endpoint amplifies it.

- **The student importer's season-mode commit never checks season scope**
  (R40). Safe only while the action is SUPER-only. In v2 the ported endpoint
  must keep that gate or add a real scope check — the choice is D3.

- **`sendInvitesAction` accepts an arbitrary user-id list**
  (`src/lib/invite-actions.ts:41-51`). SUPER-gated, so not exploitable, but the
  import flow's "send N invites" button is only correct because the client
  passes back exactly the ids the commit returned
  (`src/components/users/student-import-form.tsx:128-130`). Domain 11 owns this.

- **Neither importer is rate-limited (R84).** In v1 the server-action transport
  makes this hard to notice. As an HTTP endpoint accepting a 5 MB body and
  2000-row commits, it needs a limiter.

---

## 5. Read surface

**`buildImportPreview(buffer, filename)`** — `src/lib/student-import.ts:89-173`.
Returns `{ rows[], detectedColumns[], counts }`. Each row is
`{ rowNumber, name, email, status, message?, profile }` where `profile` carries
up to seven optional strings. Ordering is sheet order; `rowNumber` is the true
sheet row (data starts at 2, R11), so numbers are **not** contiguous when blank
rows are skipped (R20). Exactly **one database query**, batched over the
candidate email set (R26) — no N+1. The shape is identical for every caller;
there is only one caller and it is SUPER-only.

Cost note: the response contains the full personal data of every row, so a
2000-row file with all seven optional columns is on the order of half a megabyte
of JSON returned to the client and then held there (R31). See §10.

**`buildGroupImportPreview(buffer, filename, seasonId)`** —
`src/lib/group-import.ts:33-120`. Returns `{ rows[], counts }`. Each row is
`{ rowNumber, name, email, group, status, message?, studentUserId?, groupId? }`.
Two database queries, run in parallel (`:54-57`): the full season roster and the
full group list. Both are unbounded — a 400-student season loads 400 rows to
classify a 12-row file. The roster query is itself two statements
(`src/lib/groups-query.ts:144,151`), so the preview costs three round trips
regardless of file size. It returns resolved primary keys to the browser
(`studentUserId`, `groupId`), which is what makes R73 possible.

**Season list for the import target picker** —
`src/app/super/users/import/page.tsx:13-17`. All non-deleted seasons,
`startDate desc`, selecting `id`, `title`, `code`. Renders `title` only
(`src/components/users/student-import-form.tsx:144-146,270`); `code` is fetched
and never used.

**Season resolution for the group importer** —
`src/app/admin/season/[code]/roster/import/page.tsx:23`, via
`loadSeasonByCode` (domain 2, R71 there). Loads the full season detail with its
group tree and two `_count` sub-queries in order to use a single field,
`season.id`.

No read in this domain differs in shape by role, because no read in this domain
is reachable by more than one role's page.

---

## 6. Write surface

**`previewStudentImportAction(formData)`** —
`src/lib/student-import-actions.ts:25-47`. Writes nothing. Gate: `isSuper`,
throwing `ForbiddenError`. Validates the extension and the size, buffers the
file, delegates to `buildImportPreview`, and maps `ImportParseError` to a
user-visible message. Returns `{ ok, preview }` / `{ ok: false, error }`.

**`commitStudentImportAction(input)`** —
`src/lib/student-import-actions.ts:85-115`. Gate: `isSuper`. Validates the
discriminated union (R36); in season mode confirms the season is live (R39);
delegates to `commitStudentImport`; revalidates `/super/users`. Returns the full
per-row result.

**`commitStudentImport(rows, mode)`** — `src/lib/student-import.ts:231-292`.
The only write in the domain that is not delegated to another domain's action.
Per row: validate (R41) → `findUnique` by email (R43) → one transaction creating
`User` + `StudentProfile` + optionally `SeasonEnrollment` (R46) → catch `P2002`
as a skip (R52), anything else as a failure (R53).

*Non-atomic, deliberately and consequentially (R45):* the loop is the unit of
work, not the batch. The check-and-insert within a row is also non-atomic across
two statements, which R52 exists to paper over. A crash mid-loop leaves a
partial import with **no record of where it stopped** — the result object is
built in memory and returned only on completion (R54), so a request that dies
at row 900 of 2000 loses the report for the 900 rows that did commit. This is
the single most important operational property of the domain.

**`previewGroupImportAction(seasonId, formData)`** —
`src/lib/group-import-actions.ts:19-43`. Writes nothing. Gate:
`isAdminOfSeason` on a client-supplied id.

**`commitGroupImportAction(input)`** — `src/lib/group-import-actions.ts:55-67`.
Gate: `isAdminOfSeason` on a client-supplied id, checked **before** the schema
parse (`:59` before `:61`). Delegates to `assignStudentsToGroupsAction` and
returns the requested count, not the applied count (R80).

**`assignStudentsToGroupsAction(seasonId, assignments)`** —
`src/lib/group-actions.ts:192-248`, owned by domain 5. Two validation reads,
then one transaction (R79). Per accepted student: `deleteMany` on
`GroupStudent`, `create` the new membership, `upsert` the `SeasonEnrollment`.
Three statements per row inside a 20-second transaction (R81).

Neither importer notifies (R82), writes an audit row, or records the import
anywhere durable.

---

## 7. Proposed API

Envelope per `CLAUDE.md`: `{ data }` / `{ error: { code, message } }`.
Nothing in this domain exists in `apps/backend` — every row below is **new**.

The central design decision is **where the parsed rows live between preview and
commit**. v1 puts them in browser memory (R32) and re-posts them, which makes
the preview advisory (R34, R73) and makes a 2000-row commit a half-megabyte
request body. Reproducing that on mobile is both the least safe and the least
practical option: an iOS app can lose its JS context while the operator switches
to Files to check a column, and the whole preview is gone.

**Recommendation: a server-owned import session.** Preview parses the file,
stores the parsed rows server-side under an opaque `importId` scoped to the
caller, and returns the preview plus that id. Commit sends the id and a
selection, never the rows. This kills R34 and R73 outright, makes the commit
body constant-size, makes the flow resumable, and is the precondition for the
row-editing improvement in D16.

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| POST | `/api/v1/imports/students/preview` | **new** | SUPER | multipart file **or** `{ text, delimiter? }` — see §10 | `{ importId, expiresAt, rows[], detectedColumns[], unrecognisedColumns[], counts }` |
| GET | `/api/v1/imports/:importId` | **new** | owner of the session only | — | the stored preview, unchanged |
| PATCH | `/api/v1/imports/:importId/rows/:rowNumber` | **new** | owner | corrected `name` / `email` / profile fields | the re-classified row and updated `counts` |
| DELETE | `/api/v1/imports/:importId` | **new** | owner | — | `{ discarded: true }` |
| POST | `/api/v1/imports/students/commit` | **new** | SUPER | `{ importId, mode: "season" \| "alumni", seasonId? , graduationYear?, rowNumbers?, onExisting }` | `{ created, skipped, failed, rows[] }` |
| POST | `/api/v1/seasons/:id/imports/groups/preview` | **new** | `isAdminOfSeason` from the **path** id | multipart file **or** `{ text, delimiter? }` | `{ importId, expiresAt, rows[], counts }` |
| POST | `/api/v1/seasons/:id/imports/groups/commit` | **new** | `isAdminOfSeason` from the **path** id | `{ importId, rowNumbers? }` | `{ assigned, skipped, skippedStudentIds[] }` |
| GET | `/api/v1/imports/students/template` | **new** | SUPER | — | the column schema as JSON (headers, aliases, required, limits) |
| GET | `/api/v1/seasons/:id/imports/groups/template` | **new** | `isAdminOfSeason` | — | same, plus the season's current group names |

Notes on shape and on where this deliberately diverges:

- **`seasonId` moves into the path** for the group importer. v1 takes it as an
  argument on both calls (`src/lib/group-import-actions.ts:20,59`), so preview
  and commit could in principle target different seasons. A path parameter
  removes the possibility and matches the existing `seasons.ts` router shape.
- **`rowNumbers` replaces "post back the good rows".** The client asks the
  server to commit a subset of the session it already holds. Omitting the field
  means "every row the server itself classified importable" — which is the safe
  default and the one that survives a client that lost its state.
- **`onExisting` is a required, explicit field** on the student commit, not a
  default. See D4: v1's only behaviour is `skip`, and `enroll` must never be
  reachable by accident against a shared production database.
- **`unrecognisedColumns` is new.** v1 silently ignores unknown headers (R18);
  echoing them back is a one-line addition that prevents the most common
  real-world import failure. See D11.
- **`skippedStudentIds` is new** on the group commit, and the `assigned` count
  becomes the number actually written. v1 reports the requested count (R80).
- **The template endpoints return JSON, not a file.** A downloadable `.xlsx`
  template would need the same upload/CMS machinery the domain is trying to
  avoid; the mobile screen can render the column list natively and offer a
  copy-to-clipboard header row instead.
- **No `GET /imports` history.** There is nowhere to store one — see D9.

**Session storage constraint.** `CLAUDE.md` forbids creating migrations in
`space-v2` (`prisma/migrations/` is a verbatim copy of v1's), so an `ImportBatch`
table cannot be added while v1 is live. The transitional recommendation is an
in-process TTL store in the backend — 15-minute expiry, a per-user session cap,
rows held as parsed values only — with the explicit note that this does not
survive a restart or a second instance. A real table lands at cutover (Phase 6),
when v1 is retired and migrations are allowed again. This is D9 and it needs a
decision before any code.

---

## 8. Proposed shared contracts

New file `packages/shared/src/import.ts`, exported from
`packages/shared/src/index.ts` alongside the existing nine modules.

Reuse rather than redefine: `UserRole` and `EnrollmentStatus` from
`packages/shared/src/enums.ts`; the season list item from
`packages/shared/src/season.ts` for the target picker; the group list item from
`packages/shared/src/group.ts` (currently a bare `interface` at `group.ts:3` —
it converts to Zod as part of domain 5, and this domain must consume the
converted version rather than restate it).

| Schema | Fields | Notes |
|---|---|---|
| `importRowStatusSchema` | `new` \| `exists` \| `duplicate` \| `invalid` | mirrors `src/lib/student-import.ts:9` |
| `groupImportRowStatusSchema` | `assign` \| `unchanged` \| `no_student` \| `no_group` \| `invalid` | mirrors `src/lib/group-import.ts:6` |
| `importProfileFieldsSchema` | seven optional trimmed strings with the maxima in the §3 column table | mirrors `src/lib/student-import.ts:71-81`; **one definition**, used by preview and commit alike, fixing R24 |
| `studentImportRowSchema` | `name` 2–120, `email`, `profile` | mirrors `src/lib/student-import.ts:83-87` |
| `studentImportPreviewRowSchema` | `rowNumber` int, `name`, `email`, `status`, `message` nullable, `profile` | `rowNumber` is the sheet row and is not contiguous (R20) |
| `studentImportPreviewSchema` | `importId`, `expiresAt` (ISO), `rows[]`, `detectedColumns[]`, `unrecognisedColumns[]`, `counts` | `counts` = new/exists/duplicate/invalid/total |
| `studentImportCommitInputSchema` | `importId`, discriminated on `mode`: `season` + `seasonId` positive int, or `alumni` + `graduationYear` int 1990–(current year, evaluated **per request**, not at module load — R38); plus `rowNumbers[]` optional and `onExisting` enum | mirrors `src/lib/student-import-actions.ts:72-79` with the two corrections |
| `importCommitOutcomeSchema` | `created` \| `skipped` \| `failed` | `src/lib/student-import.ts:181` |
| `studentImportResultRowSchema` | `rowNumber`, `name`, `email`, `outcome`, `message` nullable, `userId` nullable | v1 omits `rowNumber` here (`:183-189`), which makes a failure report hard to map back to the sheet — add it |
| `studentImportResultSchema` | `created`, `skipped`, `failed` counts and `rows[]` | `src/lib/student-import.ts:191-196` |
| `groupImportPreviewRowSchema` | `rowNumber`, `name`, `email`, `group`, `status`, `message` nullable, `studentUserId` nullable, `groupId` nullable | `src/lib/group-import.ts:8-17` |
| `groupImportPreviewSchema` | `importId`, `expiresAt`, `rows[]`, `counts` (five statuses + total) | `src/lib/group-import.ts:19-29` |
| `groupImportCommitInputSchema` | `importId`, `rowNumbers[]` optional | `seasonId` moves to the path (§7), so it leaves the body |
| `groupImportResultSchema` | `assigned` (actually written), `skipped`, `skippedStudentIds[]` | corrects R80 |
| `importColumnSpecSchema` | `label`, `acceptedHeaders[]`, `required`, `maxLength` nullable, `target` | powers the template endpoints and the mobile help text |
| `pastedSheetInputSchema` | `text` (≤5 MB equivalent character cap), `delimiter` optional `comma` \| `tab` \| `auto` | new; the mobile paste path, §10 |

The header alias table (`src/lib/student-import.ts:24-42`) and the field labels
(`:44-52`) are pure data and belong in `packages/shared` next to these schemas —
the mobile screen needs them to render "columns we recognise" without a round
trip, exactly as `slugifySeasonCode` moves in domain 2.

`cellText` (`src/lib/spreadsheet.ts:6-22`) must **not** move to
`packages/shared`: it takes an `ExcelJS.CellValue`, and pulling `exceljs` into a
package the mobile bundle imports would ship a spreadsheet library to a phone.
It stays backend-only.

---

## 9. Screens

The v2 tree is flat and role-driven. Neither v1 import page has a v2 counterpart,
and both of their **parents** are also missing — `/users` exists only as a
placeholder and `/seasons/[code]` does not exist at all (domain 2, §9).

| v1 page(s) | v2 route | Exists? | Roles | Notes |
|---|---|---|---|---|
| `src/app/super/users/import/page.tsx` | `/users/import` | **missing — must be created** | SUPER | Parent `/users` is a placeholder file (`apps/mobile/app/(app)/users.tsx`) and is in `ALL_NAV_HREFS` (`packages/shared/src/navigation.ts:56`); the child route is new |
| `src/app/admin/season/[code]/roster/import/page.tsx` | `/seasons/[code]/roster/import` | **missing — must be created**, and so is every ancestor | ADMIN, SUPER | Depends on domain 2 creating `/seasons/[code]` first, and domain 5 creating the roster screen |
| `src/components/users/student-import-form.tsx` (preview table) | a step inside `/users/import` | — | SUPER | Do **not** port `DataTable`. A four-column grid does not fit 375 px — see §10 |
| `src/components/groups/group-import-form.tsx` (preview table) | a step inside `/seasons/[code]/roster/import` | — | ADMIN, SUPER | Same |
| the post-import invite panel (`student-import-form.tsx:170-218`) | a result step inside `/users/import`, linking to domain 11's invite action | — | SUPER | Keep it a separate explicit action (R55) — do not fold invites into commit |

Both import screens are multi-step and should be modelled as a stack of steps
inside one route rather than as separate routes, so the `importId` and the
step state live in one screen's local state and the back gesture means "previous
step". Query keys need an `imports` factory in
`apps/mobile/src/lib/query-keys.ts`, which currently holds only `sessions`
(`:22-33`).

Neither import destination belongs in the tab bar. Both are reached from their
parent list screen's header action, matching v1
(`src/app/super/users/page.tsx:59`; `src/app/admin/season/[code]/roster/page.tsx:42`),
so `navigation.ts` needs no new entries and `(app)/_layout.tsx` hides them with
`href: null` per the convention in `CLAUDE.md`.

---

## 10. Open questions and divergences

### The mobile problem

The migration design names this domain, with reports, as one of the two worst
fits for mobile: *"CSV import (pick a file, preview rows, correct errors,
commit) … They are possible; they are not cheap, and they will not feel like
their web equivalents"*
(`docs/superpowers/specs/2026-08-21-full-migration-design.md:100-105`). Four
separate things are hard, and they are worth separating because three of them
have good answers and one does not.

**(a) Getting bytes into the app.** `expo-document-picker` is **not installed**
in `apps/mobile` (verified: no document-picker, no `expo-file-system`, no
clipboard package in `apps/mobile/package.json`). Adding it is routine. The
blocking issue is downstream: **uploads are switched off in the v2 backend**.
`ENABLE_UPLOADS` defaults to `false` and the submission upload route returns
`503 uploads_disabled` while file handling moves to a CMS (`CLAUDE.md`;
`apps/backend/src/lib/config.ts:36-41`;
`apps/backend/src/routes/submissions.ts:145-159`). An importer with no upload
path is not an importer.

But the flag and the CMS migration are about **persisted** files — submission
attachments that need a storage driver, a retention story and a serving route.
An import file is the opposite: it is read once, parsed in memory, and must
*never* be stored, because it is a spreadsheet of students' names, phone
numbers, birth dates and pastoral notes. Treating it as an "upload" is a
category error that the shared flag would enforce.

*Recommendation:* import intake is **not** gated by `ENABLE_UPLOADS`, and the
preview routes do not go near the `Storage` interface. State that explicitly in
the route file, because the next reader will assume otherwise. If a second flag
is wanted, make it `ENABLE_IMPORTS`, defaulting **on**, so the two concerns
cannot be conflated again.

**(b) The file picker itself.** *Recommendation: make pasted text the primary
input and the file picker the secondary one.* The reasons are specific rather
than aesthetic:

- It needs no multipart pipeline, no `multer`, no storage driver, no CMS
  decision, and no upload flag. The request body is a JSON string.
- On a phone, the realistic source of a roster is a message, an email body, or a
  selection copied out of Google Sheets — all of which paste. A file sitting in
  the device's Files app is the *less* common case, not the more common one.
- Spreadsheet apps put **tab-separated** text on the clipboard, so the paste path
  must accept TSV as well as CSV. Sniffing `\t` versus `,` on the header line
  covers both; expose it as `delimiter: comma | tab | auto` (§8) so a
  comma-containing name in a TSV cannot be misread.
- It degrades honestly: `.xlsx` **cannot** be pasted, so the file path remains
  necessary for Excel workbooks and should ship as soon as the intake decision
  in (a) lands.

The parsing consequence is that the backend needs a delimited-text path that
does not go through `exceljs`. v1's CSV branch already takes a `Readable`
(`src/lib/spreadsheet.ts:33`), so a pasted string can be fed through the same
function with a synthesised `.csv` filename — but that branch has no delimiter
option, so TSV needs either an explicit `exceljs` parser option or a small
dedicated splitter. Keep `exceljs` for `.xlsx` only; it is the only thing it is
genuinely needed for.

**(c) Previewing rows on a 375 px screen.** v1 renders a four-column
`DataTable` (`src/components/users/student-import-form.tsx:148-164`;
`src/components/groups/group-import-form.tsx:84-100`). That does not fit and
must not be ported. *Recommendation:* a counts summary card at the top (the
data is already there — R30, R71), a segmented filter over the statuses, and a
virtualised **single-column card list** below it, one card per row showing
name/email, the status badge and the message. Default the filter to the rows
that need attention (`invalid` + `duplicate`), because on a phone the operator
will not scroll 2000 rows to find row 1841. This is a better information
hierarchy than v1's table, not a worse one — the table is the thing that has
been carrying the counts' meaning by adjacency.

**(d) Correcting errors — the one that is genuinely worse.** v1 has **no row
editing**. The operator fixes the spreadsheet in Excel and uploads again; both
forms reset to the file picker on a new file
(`src/components/users/student-import-form.tsx:75-81`;
`src/components/groups/group-import-form.tsx:38-43`). On a phone that round trip
is not available — there is no Excel to switch to, and if the source was a paste
the original may not exist as a file at all.

*Recommendation:* the server-owned import session (§7) makes inline correction
cheap, because the server already holds the rows and can re-classify one of them
(`PATCH /imports/:importId/rows/:rowNumber`). Ship it. This is the one place
where the mobile version should be **better** than v1, and it converts the
domain's worst mobile weakness into its best feature. It is also the strongest
argument for the session model on its own, independent of D1.

**(e) A consequence worth naming.** Everything above is unlocked by the same
decision — moving the parsed rows to the server. Client-memory preview (R32)
fails on mobile for a fifth reason not present on the web: iOS can evict a
backgrounded app's JS context, and an operator who switches to Mail to check a
column loses the entire preview. There is no client-side design that survives
this. The session is not an optimisation; it is the port.

### Divergences

**D1 — The preview is advisory; the commit trusts the client's rows (R34, R73).**
The most consequential structural defect in the domain. A commit can be issued
with rows that were never parsed, never validated by the server's own
classification, and never seen by the operator. In v1 the transport hides it; as
an HTTP endpoint it is plainly visible. Note the honest framing from §4: this is
an **integrity** hole, not an authorization hole — both role gates hold, and the
group importer's write independently re-derives its scopes (R75, R76).
*Recommendation:* the server-owned import session in §7. The commit sends an
`importId` and a row selection; the server commits only rows it parsed itself.
Do not port the "post the rows back" protocol.

**D2 — The two importers disagree about email case, and v1 normalises email
nowhere (R25, R28, R60).** The student importer matches existing users by exact
string (`src/lib/student-import.ts:158,247`); the group importer lower-cases both
sides (`src/lib/group-import.ts:58,73`). `User.email` is a plain unique column
with no `citext` (`prisma/schema.prisma:105`), and `verifyCredentials` looks it
up verbatim (`src/lib/auth/credentials.ts:22`) — there is no `toLowerCase` on any
email anywhere in `src/lib` (verified by grep). Two consequences follow. A file
containing `Foo@x.com` and `foo@x.com` creates **two accounts** (R25). And an
account imported with a capitalised address can only ever be logged into by
typing that exact capitalisation.
*Recommendation, and be careful here because the database is shared with live
v1:* change the **comparison**, not the storage. Make the v2 importer's
existence check case-insensitive so it cannot mint a duplicate, and make in-file
duplicate detection case-insensitive too, while continuing to store the address
exactly as typed so v1's case-sensitive login keeps working for every existing
row. Actually normalising stored emails is a coordinated change across domain 11
(users) and domain 1 (auth) that must not be made unilaterally from an importer,
and must not be made at all until v1 is retired. Flag it to both.

**D3 — The student importer's season-mode commit checks season liveness but not
season scope (R40).** `src/lib/student-import-actions.ts:94-99` confirms the
season exists; nothing confirms the caller administers it. Correct today only
because the action is `isSuper`-gated at `:89`.
*Recommendation:* keep the v2 endpoint SUPER-only. If a future product decision
lets a season ADMIN import their own roster — which is the obvious next request,
since they already own the group importer — the scope check must be added in the
**same** change, not assumed from the role gate that is being removed.

**D4 — An existing user is skipped, never enrolled (R44). This is the highest-value
product gap in the domain.** Bulk-importing a returning student into a new season
does nothing at all: they are `exists` in the preview, `skipped` at commit, and
they end the import with their old `activeSeasonId` and no new enrollment. The
operator's only signal is a warning badge reading "Skip · exists"
(`src/components/users/student-import-form.tsx:48`). For a seasonal programme
where cohorts repeat, this is the single most likely reason a real import
"silently did nothing".
*Recommendation:* add an explicit `onExisting` mode to the v2 commit (§7):
`skip` reproduces v1 exactly; `enroll` creates the `SeasonEnrollment` and sets
`activeSeasonId` **without touching the existing `User` or profile fields**.
Never offer a mode that overwrites profile data from a spreadsheet — that is how
a stale export erases a year of pastoral notes. Make the field required so no
default is inherited by accident, default the UI to `skip`, and require a
confirmation step for `enroll` that names the count. This changes observable
behaviour against a shared production database and needs a product decision
before code. Flag to domain 6.

**D5 — The group importer reports a count it did not verify (R80).** It returns
the requested array length; `assignStudentsToGroupsAction` silently skips any
student whose `activeSeasonId` is not the season (R76). "Assigned 40 students"
can mean 12 were written. The two skip paths (R76 here, R44 in the student
importer) are both silent, and the group one is worse because it is *reported as
success*.
*Recommendation:* return the true count plus `skippedStudentIds` (§7), and have
domain 5's action return what it applied rather than nothing
(`src/lib/group-actions.ts:247`). Cross-domain — the fix belongs to domain 5;
this domain is the consumer that makes it matter.

**D6 — A soft-deleted user's email blocks re-import permanently (R27, R43).**
Neither the preview lookup nor the commit lookup filters `deletedAt`. A student
who was soft-deleted can never be re-imported; the row reads "Already in the
system" forever, and the operator has no way to see why from the import screen.
*Recommendation:* keep the lookup unfiltered — un-deleted matching would let an
import resurrect a deliberately-removed account, which is worse — but give the
preview a distinct status and message for it ("previously removed — restore from
the users screen"). The restore action itself belongs to domain 11.

**D7 — The same data imports differently depending on file format (R7, R8).**
`spreadsheet.ts:29-34` protects CSV cells from numeric coercion, with a comment
explaining exactly why (phone numbers). `:35-36` gives XLSX no such protection,
so `+201234567` typed into Excel becomes a number and comes back through
`cellText` (R9) as a different string. The protection exists precisely because
someone hit this, and it was only applied to half the code path.
*Recommendation:* in v2, read `.xlsx` cells as their formatted text where one
exists, and treat a numeric cell targeting the phone column as an error the
operator must fix in the source rather than silently mangling it. At minimum,
surface the coerced value in the preview so it is visible before commit.

**D8 — `dateOfBirth` is parsed by `new Date(string)` and failures are silent
(R50).** Three problems in one line
(`src/lib/student-import.ts:209-210`). The constructor resolves `01/02/2003` as
2 January in V8, so a European sheet imports every birthday with the month and
day transposed. It resolves a bare date to **local-timezone midnight**, and v1
has no timezone handling anywhere — consistent with the rest of the migration
findings — so on a UTC+2 server the stored instant lands on the previous day in
UTC. And an unparseable value is dropped without failing the row, so the
operator sees "created" and a missing birth date.
*Recommendation:* accept ISO `YYYY-MM-DD` only, reject anything else as an
`invalid` row with a message naming the expected format, and store as UTC
midnight. Note that R9 already yields ISO for a true `.xlsx` date cell
(`src/lib/spreadsheet.ts:10`), so this is strict only for text dates — which is
exactly where the ambiguity lives.

**D9 — There is nowhere to persist an import session, and no migration is
allowed (§7).** `CLAUDE.md` forbids new migrations in `space-v2` while v1 runs
on the shared database. The session model D1 depends on therefore has no table
to live in.
*Recommendation:* an in-process TTL store for the transition — 15-minute expiry,
per-user cap, rows only, evicted on commit — with the limitation written into
the route file: it does not survive a restart and does not work behind more than
one instance. Add the real table at Phase 6 cutover. **This needs a decision
before any code in this domain is written**, because it determines whether the
API in §7 is buildable as specified.

**D10 — The group importer cannot unassign (R69).** A blank group cell is
classified `no_group`, yet the underlying action accepts `groupId: null` and
handles it correctly (`src/lib/group-actions.ts:194,231-235`). There is no way
to bulk-remove students from groups.
*Recommendation:* treat a reserved literal (`-`, or an explicit `none`) as an
unassign, keep a blank cell as `no_group` so an accidentally empty column cannot
wipe a season's groupings, and show unassigns as their own count in the preview.

**D11 — Unrecognised columns are silently ignored (R18).** A header typed
`Mobile Number ` with a trailing space, or `Phone No`, or `Uni`, matches nothing
in the alias table (`src/lib/student-import.ts:24-42`) and the column vanishes
without a word. The preview shows `detectedColumns` (R19) but never says what it
*failed* to detect, which is the half that matters.
*Recommendation:* return `unrecognisedColumns[]` in the preview (§7) and render
it as a warning above the row list. Cheap, and it prevents the most common
real-world silent data loss in this domain.

**D12 — Preview and commit validate to different standards (R24, R41).** Length
limits exist only on the commit side, so an over-long name previews as `new`,
survives the client's filter (R33), and comes back `failed` after the operator
has already committed. On mobile that round trip is far more expensive.
*Recommendation:* one schema, used by both — `importProfileFieldsSchema` and
`studentImportRowSchema` in §8. This is the class of drift domain 2 already hit
between its server and client copies of the season schema.

**D13 — The student import is not transactional and loses its report on failure
(R45, R54).** A commit that dies at row 900 of 2000 has written 900 rows and
returns nothing at all, so the operator cannot tell what landed. Re-running the
file is safe (R44 makes it idempotent) but they do not know that from the screen.
*Recommendation:* keep the per-row loop — an all-or-nothing 2000-row import that
aborts on row 1999 is strictly worse, and R44 already makes retry safe — but
persist the running result into the import session (D9) as rows complete, so a
died request leaves a readable report, and let the operator re-open it. Say
plainly in the UI that re-running the same file is safe. Contrast R79: the group
import *is* transactional, and should stay that way.

**D14 — The season export cannot be round-tripped into the student importer
(`src/lib/season-export.ts:106,130,158`).** Every export sheet's first column is
headed `"Student"`, not `"name"`. The group importer accepts such a file
(it needs only `email` and `group`, both present), but the student importer
rejects it outright with R15's message — which reads, to an operator holding a
file this system just produced, like a bug.
*Recommendation:* add `student` to the name alias table. Cross-domain with 17
(reports and exports); the one-word fix belongs here.

**D15 — No import leaves an audit trail (§2).** `User` has no
`createdById`/`updatedById` columns (`prisma/schema.prisma:103-160`), the result
object is in-memory only (R54), and nothing records which operator imported which
batch. After the fact there is no way to answer "who added these 200 accounts,
and from what file".
*Recommendation:* fold this into D9's durable session — importer id, row counts,
mode, target, and outcome per row, retained. Do not store the file itself or the
raw sheet; it is student personal data with no retention story. Flag the missing
`User` audit columns to domain 6 as a schema question for cutover.

**D16 — Two importers exist, not three, and there is no importer for anything
else.** There is no way to bulk-create leaders, admins, mentors, sessions,
attendance or grades — role is hard-coded to `STUDENT` (R47) and staff roles are
assigned individually elsewhere. The `/super/users/import` page is the student
importer with an alumni target (R36, R37), not a separate user importer.
*Recommendation:* do not invent a user importer during the port. If bulk staff
creation is wanted, it is a new feature and belongs to domain 11, after this
domain's session model exists to build on.

**D17 — `Group.name` is not unique and matching silently prefers the last
duplicate (R65).** Two groups named "Group A" and "group a" in one season make
every row targeting that name land in whichever the query returned last
(`src/lib/groups-query.ts:132` orders by name, so the ordering is at least
stable, but the choice is arbitrary).
*Recommendation:* detect the collision at preview time and refuse the file with
a message naming the ambiguous group, rather than guessing. The uniqueness
constraint itself is domain 5's question.

**D18 — Neither importer is rate-limited or guarded against concurrent runs
(R84).** Two operators committing the same file simultaneously is survivable for
the student importer (R52 turns the loser's rows into skips) and effectively
last-writer-wins for the group importer. As HTTP endpoints accepting 5 MB bodies
and 2000-row commits, both want a limiter and a per-user in-flight guard.
*Recommendation:* one import in flight per user, enforced by the session store
(D9); a modest rate limit on the preview routes, in the same shape as the
existing auth limiters (`CLAUDE.md`, response envelope section).

**D19 — Preview responses carry bulk student personal data to the client (R31),
and failures log email addresses (R53).** A 2000-row preview is a complete
roster with phone numbers, birth dates and pastoral notes, held in browser
memory in v1 and in device memory in v2.
*Recommendation:* the session model already shrinks the commit payload; also cap
what the preview returns by default (counts plus the first page of rows, with
the rest paged) rather than shipping every row to a phone. Drop the email from
the server-side error log (`src/lib/student-import.ts:280`) and log the row
number instead.
