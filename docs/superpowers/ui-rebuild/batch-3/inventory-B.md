# Inventory B — leader role (submissions queue, submission review, staff assignment detail)

v1 root = `/home/mark/projects/JPC/.v1-reference/app/src` · v2 root = `/home/mark/projects/JPC/space-v2/apps/mobile` · shared = `/home/mark/projects/JPC/space-v2/packages/shared/src` · backend = `/home/mark/projects/JPC/space-v2/apps/backend/src`

Common to all three (v1):
- The page sits inside the leader shell `<main class="... px-4 pb-24 pt-4">` on `bg-brand-navy-50` (see gaps-batch-2 "Shell fixes"). v2 → `src/design/layout/shell-frame.tsx` (`ShellFrame`, with optional `onRefresh`/`refreshing` RefreshControl). All three v2 screens still use the legacy `Screen` (src/ui).
- Leader tab bar in the shots: My Group · Calendar · Home · **Submissions** · More. v2 `packages/shared/src/navigation.ts:112-118` has the same five tabs, so `/submissions` is a tab root (no back link, as in v1).
- Route loading (v1 `app/leader/loading.tsx`, 16 l): **identical** to the student skeleton (`Skeleton.h-32 rounded-2xl` · 3-col `Skeleton.h-24 rounded-2xl` · 2× `SkeletonCard`) → reuse `RouteSkeleton` (`src/design/layout/route-states.tsx`).
- Route error (v1 `app/leader/error.tsx`, 23 l): `EmptyState icon=AlertTriangle title="Something went wrong" description="We couldn't load this page. Please try again — if it keeps happening, let an admin know." action=<Button>Try again</Button>`. **Copy differs from the student one** ("let your leader know"), which `RouteError` hard-codes → GAP(component): `RouteError` needs a description prop or a role-aware default.
- `app/leader/template.tsx` → RouteTransition (motion only).
- Dialog shots (`*__dialog-0/1/2.png`) for every screen here are shell chrome only: dev "switch user" popover, notification bell popover, user menu (name, LEADER role badge, Profile settings / Dark mode / Sign out). No screen-specific dialog exists on these routes in v1.
- v1 `Card` (`components/ui/card.tsx`, 80 l): `rounded-2xl bg-card shadow-[var(--shadow-soft)] ring-1 ring-border`; `CardHeader` `flex flex-col gap-1.5 p-4 md:p-6`; `CardTitle` (h3) `text-base font-semibold leading-tight tracking-tight md:text-lg`; `CardContent` `p-4 pt-0 md:p-6 md:pt-0`. Dropped at 375: `md:p-6`, `md:pt-0`, `md:text-lg`. v2 port `src/design/ui/card.tsx` already gives `p-4` / `text-base font-semibold leading-tight tracking-tight`.
- v1 `Badge` base (`components/ui/badge.tsx`, 47 l): `inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap`; `outline` = `border-border bg-transparent text-foreground`; `warning` = `bg-warning-100 text-warning-800` (**no dark variant** — the dark shot shows a light-yellow "Late" pill on navy; the v2 port matches); `secondary` = `bg-secondary text-secondary-foreground`.
- v1 `SubmissionStatusBadge` (`components/ui/submission-status-badge.tsx`, 55 l): `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium` + DRAFT `bg-muted text-muted-foreground dark:bg-neutral-800 dark:text-neutral-300` "Draft" / SUBMITTED `bg-info-100 text-info-800 dark:bg-info-950 dark:text-info-200` "Submitted" / REVIEWED `bg-success-100 text-success-800 dark:bg-success-950 dark:text-success-200` "Reviewed" / RETURNED `bg-warning-100 text-warning-800 dark:bg-warning-950 dark:text-warning-200` "Returned". Ported 1:1 in `src/design/ui/submission-status-badge.tsx`.
- Date format on these pages: `format(instant, "MMM d, h:mm a")` (no year, browser zone), e.g. `Jul 1, 6:13 PM`. v2 has no helper for this pattern (`formatShortDate` = `MMM d`, `formatDateTime` = `EEE, MMM d, yyyy · h:mm a`) → add one (e.g. `formatShortDateTime`), device zone (the queue/detail carry no org-day/org-time fields; same accepted X13 gap as batch 2).

---

## 1. /leader/submissions → `app/(app)/submissions.tsx`

### a) v1
Files: `app/leader/submissions/page.tsx` (27 l), `components/assignments/leader-queue-list.tsx` (80 l), `components/ui/data-table.tsx` (113 l, phone branch = `md:hidden` list), `components/ui/submission-status-badge.tsx` (55 l), `components/ui/badge.tsx` (47 l), `components/ui/empty-state.tsx` (54 l), `lib/submissions-query.ts` (151 l; `listSubmissionsForLeader` l.110-151).
Shots: `shots/leader/light/leader__submissions.png`, `shots/leader/dark/leader__submissions.png` (+ `__dialog-0..2`, shell chrome).

Data (`listSubmissionsForLeader`): students in `user.groupLeaderIds` groups (via `GroupStudent`), submissions with `status in [SUBMITTED, REVIEWED, RETURNED]` (**all three, not only pending**), `orderBy [status asc, submittedAt desc]` → SUBMITTED first, then REVIEWED, then RETURNED (shot confirms: Submitted rows, then Reviewed, a Returned row last). No paging, no season filter. Forum posts appear as ordinary rows (shot row 1-2 "… test forum"; spec 14 R55).

Render tree:
- `div.flex flex-col gap-4`
  - header `div`
    - `h1.text-2xl font-black text-brand-navy-900 dark:text-foreground` → `Submissions`
    - `p.mt-1 text-sm text-muted-foreground` → `` `${pending} pending review · ${total} total${late>0 ? ` · ${late} late` : ""}` `` (pending = SUBMITTED count; late = submittedAt > dueAt), e.g. `6 pending review · 19 total · 2 late`
  - `LeaderQueueList rows` → `DataTable`
    - **empty** (rows.length 0): `EmptyState icon=Inbox title="No submissions yet" description="Submissions from students in your groups will appear here."` (no card)
    - phone list (the `hidden … md:block` table is dropped entirely): `div.w-full` > `div.overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-soft)]` > `ul.divide-y divide-border/60` > per row `li.flex min-h-11 items-center gap-3 px-4 py-3`
      - `div.min-w-0 flex-1`
        - primary cell (column "Student"): `div.flex flex-col`
          - `Link href=/leader/submissions/{publicId} .font-medium text-foreground hover:underline` → `studentName ?? studentEmail` (no size class → inherits body 16px; shot confirms larger than the meta)
          - `span.text-xs text-muted-foreground` → `{groupName ? `${groupName} · ` : ""}{studentEmail}` e.g. `Alpha · name@jpc.test`
        - meta row (headed columns Assignment, Status, Submitted): `div.mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground`, items separated by `span[aria-hidden]` `·`; each item wrapped in `span.min-w-0`
          - Assignment: `span` → `assignmentTitle` (inherits text-xs muted)
          - `·`
          - Status: `div.flex items-center gap-1.5` > `SubmissionStatusBadge status` + (submittedAt && dueAt && submittedAt > dueAt) `Badge variant="warning"` `Late`
          - `·`
          - Submitted: submittedAt ? `span.text-sm text-muted-foreground` `format(submittedAt,"MMM d, h:mm a")` (overrides to 14px — shot shows date larger than title) : `span.text-sm italic text-muted-foreground` `—`
        - Wrapping at 375 (shot): long titles push the badge and/or date onto a second line; the trailing `·` stays at the end of line 1.
      - no action columns (no header-less column) → no right-hand block.
  - Only the student name is a link; the rest of the row is not pressable.
- md:/lg: dropped: the whole `<table>` branch (`hidden md:block`) and `md:hidden` on the list. Nothing else.

### b) v2 current — `app/(app)/submissions.tsx` (83 l)
- Hooks (keep): `useSessionStore` role; `isStaff = role !== null && role !== "STUDENT"`; `useSubmissionQueue(PENDING={pendingOnly:true}, isStaff)` (`src/hooks/use-submission-queue.ts`) → `useInfiniteQuery`, key `queryKeys.submissions.queue(filters)` (`["submissions","queue",filters]`), GET `/api/v1/submissions?pendingOnly=true&limit=25[&seasonId][&cursor]`, parse `submissionQueueSchema`, `getNextPageParam = nextCursor`. Review mutation invalidates `queryKeys.submissions.queues()`.
- Backend `routes/submissions.ts:88-200`: STUDENT 403; scope `submissionQueueScopeFor(user)` (leader → own groups); DRAFT never listed; `pendingOnly` → `status: SUBMITTED` only; counts computed over the whole reachable scope (ignore pendingOnly/paging); order `[status asc, submittedAt desc nulls last, id desc]` = v1's order.
- Renders: non-staff → `EmptyState "Submissions" / "This screen isn't available for your role."`; header counts line (Text label, same string as v1) — **no "Submissions" title**; LoadingState; `ErrorState "Couldn't load the review queue."`; empty → `EmptyState "All caught up" / "No submissions waiting for review."`; one legacy `Card` per row (Pressable whole card) with `assignmentTitle` heading + `"{studentName ?? "Unnamed"} · {groupName ?? "No group"}{ · Late}"`; `Button "Load more"` (secondary) when `hasNextPage`. Pull-to-refresh via `Screen onRefresh`.
- Navigation: `router.push({ pathname: "/submission/[publicId]", params: { publicId } })`.
- Legacy imports: `../../src/theme` (useTheme), `../../src/ui` (Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text).

### c) Data mapping
| v1 element | v2 source |
|---|---|
| H1 `Submissions` | constant ✓ (v2 renders none today) |
| pending / total / late | `data.pages[0].counts.pending/total/late` ✓ (server, scope-wide; same definition as v1) |
| row list | `data.pages.flatMap(p => p.items)` ✓ — but only SUBMITTED while `pendingOnly: true` → **GAP/ruling** (see below) |
| order | server order = v1 ✓ |
| student name | `item.studentName` ✓ (nullable) |
| name fallback `studentEmail` | **GAP** — `submissionQueueItemSchema` has no `studentEmail` |
| `{groupName} · {studentEmail}` line | `item.groupName` ✓ (C9: from enrolment); email **GAP** (same field) |
| assignmentTitle | `item.assignmentTitle` ✓ |
| status badge | `item.status` → `SubmissionStatusBadge` ✓ |
| Late badge | `item.isLate` ✓ (C4, server) |
| submitted `MMM d, h:mm a` / `—` | `item.submittedAt` → new helper ✓ (device zone) |
| link target | `item.publicId` → `/submission/[publicId]` ✓ |
| empty state | constant ✓ |

GAP / V2-ONLY:
- **GAP(ruling) list scope**: v1 lists every SUBMITTED/REVIEWED/RETURNED row; v2 asks `pendingOnly=true` and shows only SUBMITTED, while its header still counts everything ("6 pending review · 19 total" over 6 rows). For v1 parity pass `pendingOnly: false` (backend already supports it; same order). Test l.42/47 pin the `pendingOnly=true` URL. Shared schema comment (`submission.ts:131`) says "Defaults to true — it is a queue". Needs owner ruling.
- **GAP(contract)**: no `studentEmail` on queue items → second line can't show `Alpha · email`, and a null name can't fall back to email. Fix = add `studentEmail` to `submissionQueueItemSchema` + backend select (leader is entitled to it: v1 showed it and the detail already returns it; C8 is about students, not staff). Without it: show `groupName` alone and fall back to… nothing sensible ("Unnamed" is v2 copy).
- V2-ONLY: cursor paging + "Load more" (spec 08 D12; tested). Keep — style as v1 `Button variant="outline"` under the card (no v1 equivalent).
- V2-ONLY: pull-to-refresh, ErrorState (→ use `RouteError` with leader copy), role guard screen for STUDENT (tested, keep).
- V2-ONLY copy: empty `All caught up` / `No submissions waiting for review.` → v1 `No submissions yet` / `Submissions from students in your groups will appear here.` (only meaningful once pendingOnly=false; with pendingOnly=true v1's copy is misleading).
- Season scope: spec 08 D12 recommends defaulting to the caller's active season; the hook sends no `seasonId`, so v2 (like v1) spans seasons. No change needed for parity.
- Press target: v1 only the name is a link; v2 whole card. Keep the whole `li` pressable (bigger target; a11y role button) or make only the name pressable — minor, pick whole row (tests press the title).

### d) Components
- Ported: `DataTable` (`src/design/ui/data-table.tsx`, the phone branch: primary cell + "·"-joined meta row + action column; wraps string cells in Text) — use it directly with v1's four columns; `SubmissionStatusBadge`; `Badge variant="warning"`; `EmptyState` (icon `Inbox` from lucide-react-native); `PageTitle` (`src/design/layout/page-title.tsx`, `text-2xl font-black…` + `mt-1 text-sm text-muted-foreground` subtitle — exactly v1's header); `RouteSkeleton`; `Button`.
- Check in DataTable port: v1 meta row puts each cell in `span.min-w-0` and the separators inline in a wrapping flex row — confirm the port wraps (`flex-row flex-wrap items-center gap-x-1.5 gap-y-0.5`) and that the date span can override to `text-sm`.
- Needs port: `components/assignments/leader-queue-list.tsx` (80 l) → e.g. `src/design/submissions/leader-queue-list.tsx` (column defs only; row press → router). Needs the new `MMM d, h:mm a` formatter.

### e) Tests — `src/__tests__/submission-queue.test.tsx` (108 l)
- Behaviour (keep): requests `/api/v1/submissions?pendingOnly=true&limit=25` then `…&cursor=aaa1111111` and "Load more" disappears on the last page (l.41-50; URL changes to `pendingOnly=false` if the scope ruling goes v1's way); press → push `/submission/[publicId]` `aaa1111111` (l.63-75); student gets the guard and **no request** (l.85-92); header counts `4 pending review · 9 total · 2 late` (l.94-100) and late omitted when 0 `1 pending review · 3 total` (l.102-108) — copy identical to v1, keep.
- Markup/copy (will change): `findByText("Essay one")` as the row's pressable heading (l.41, 45, 69 — title moves into the meta row; still findable, but the press target in l.69 must still navigate, so make the whole row pressable); `"Test student · Group A · Late"` (l.60 → separate Texts: name `Test student`, `Group A · {email}` (needs fixture `studentEmail`), status badge `Submitted`, badge `Late`); `"All caught up"` (l.82 → `No submissions yet`); `/isn't available for your role/` (l.90, V2-ONLY copy, may stay). Fixture `queueItem` (l.15-22) gains `studentEmail` if the contract adds it (X11).
- Others touching this route: `dashboard.test.tsx` (leader/admin blocks press their "Pending review" tile → `/submissions`; unaffected), `app-layout.test.tsx` (tab list; unaffected).

---

## 2. /leader/submissions/[publicId] → `app/(app)/submission/[publicId].tsx`

### a) v1
Files: `app/leader/submissions/[publicId]/page.tsx` (121 l), `components/assignments/submission-review-form.tsx` (65 l), `lib/submission-actions.ts` (204 l; `reviewSubmissionAction` l.161-204), `lib/submissions-query.ts` (`loadSubmissionByPublicId` l.32-96), `components/ui/rich-text-view.tsx` (53 l), `components/ui/rich-text-editor.tsx` (213 l), `components/ui/card.tsx` (80 l), `components/ui/submission-status-badge.tsx`, `components/ui/badge.tsx`, `components/ui/button.tsx` (64 l). Icon: `File` (lucide).
Shots: `shots/leader/{light,dark}/leader__submissions__publicId.png` (a forum post, SUBMITTED + Late, no prompt card, "Add feedback" empty editor, teal "Mark as reviewed" in dark), `leader__submissions__{FwsYZexPgf,ijnMmTyqnE,kUDRldZbfn,LvoCavpRDC,PumFyLKsNI,zatolGWJBn}.png` (REVIEWED rows: "Update feedback" with prefilled editor, "Update review"; prompt card present when description exists). None of the shots shows attachments or a RETURNED row.

Gate: `requireRole(LEADER, ADMIN, SUPER, MENTOR)`; missing → `notFound()` (404 page); `!canViewSubmission` → `redirect("/leader/submissions")`; `canReview = canReviewSubmission(user, id)`; `isLate = submittedAt > assignmentDueAt`.

Render tree:
- `div.flex flex-col gap-4`
  - header `div`
    - `h1.text-2xl font-black text-brand-navy-900 dark:text-foreground` → `assignmentTitle` (wraps; dark shot 2 lines)
    - `p.mt-1 text-sm text-muted-foreground` → `` `${studentName ?? studentEmail}${groupName ? ` · ${groupName}` : ""}` ``
  - badges `div.mb-4 flex flex-wrap gap-2` (mb-4 + gap-4 → 32px to the next card; shot confirms)
    - `SubmissionStatusBadge status`
    - isLate → `Badge variant="warning"` `Late`
    - submittedAt → `Badge variant="outline"` `Submitted {MMM d, h:mm a}`
    - assignmentDueAt → `Badge variant="outline"` `Due {MMM d, h:mm a}` (wraps to a 2nd line at 375)
  - assignmentDescription → `Card.mb-4` > `CardHeader` > `CardTitle.text-base` `Assignment prompt` · `CardContent` > `RichTextView html={assignmentDescription}` (no emptyText; card omitted when null)
  - `Card.mb-4`
    - `CardHeader` > `CardTitle.text-base` `Submission`
    - `CardContent.flex flex-col gap-4`
      - `RichTextView html={text} emptyText="No written response."` (empty → `p.text-sm italic text-muted-foreground`)
      - files.length > 0: `div.flex flex-col gap-1.5`
        - `p.text-sm font-medium` `Attachments`
        - per file `div.flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm` (not a link — not pressable)
          - `span.inline-flex items-center gap-2 truncate` > `FileIcon.size-4 shrink-0 text-muted-foreground` + `span.truncate` originalName
          - `span.shrink-0 text-xs tabular-nums text-muted-foreground` `{(sizeBytes/1024).toFixed(1)} KB`
        - `p.text-xs italic text-muted-foreground` `File download isn't wired up in the demo build — see TODO.md.`
  - canReview → `SubmissionReviewForm submissionId initialFeedback={feedback ?? ""} alreadyReviewed={Boolean(reviewedAt)}`:
    - `Card` (no mb) > `CardHeader` > `CardTitle.text-base` → alreadyReviewed ? `Update feedback` : `Add feedback`
    - `CardContent.flex flex-col gap-4`
      - `RichTextEditor value onChange placeholder="What did the student do well? What could be stronger?"` — wrapper `relative overflow-hidden rounded-md border border-input bg-background …focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40`; toolbar `div.flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 px-1.5 py-1` with icon-sm ghost/secondary buttons Bold, Italic, Strikethrough, Bullet list, Numbered list, Link, then `ml-auto` Undo, Redo; editor `prose prose-sm max-w-none min-h-32 px-3 py-2 outline-none text-sm`; placeholder `span.pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground`.
      - error → `p.rounded-md bg-error-50 px-3 py-2 text-sm text-error-800` `{result.error}` (only server copy: `Invalid feedback.`; Forbidden throws → error boundary)
      - `div.flex justify-end` > `Button` (default variant; navy in light, teal in dark per shots) → pending `Saving…` : alreadyReviewed ? `Update review` : `Mark as reviewed`; disabled while pending.
    - On success: `router.refresh()` — **stays on the page**; title flips to "Update feedback"; status becomes REVIEWED; student notified `Feedback ready on "{title}"`.
    - **No "return for revision" action anywhere in v1** (RETURNED has no producer; spec 08 D11). Empty feedback is accepted (D10).
  - !canReview && feedback → `Card` > `CardHeader` > `CardTitle.text-base` `Feedback` · `CardContent` > `RichTextView html={feedback}`; !canReview && no feedback → nothing. (When canReview, the feedback is shown only inside the editor — never as a separate card.)
- md:/lg: dropped: `md:p-6`, `md:pt-0` (CardHeader/CardContent), `md:text-lg` (CardTitle). Nothing else.

### b) v2 current — `app/(app)/submission/[publicId].tsx` (101 l)
- Hooks (keep): `useLocalSearchParams` publicId (empty → null); `useSubmissionDetail(publicId)` (`src/hooks/use-submission.ts`) → key `queryKeys.submissions.detail(publicId)`, GET `/api/v1/submissions/{publicId}`, parse `submissionDetailSchema`, enabled publicId!==null; `useReviewSubmission(publicId)` → POST `/api/v1/submissions/{publicId}/review` body `{feedback}` + `returnForRevision: true` only when set, parse `reviewSubmissionResponseSchema`, `meta: DASHBOARD_META`, onSuccess invalidates `submissions.detail(publicId)` and `submissions.queues()`.
- Backend: GET `/:publicId` (`routes/submissions.ts:209-262`) gates on `canViewSubmission`, returns `text`/`feedback` through `htmlToPlainText` (**plain text on the wire**). POST `/:publicId/review` (l.407-460): `canReviewSubmission` → 403; DRAFT without `returnForRevision` → 409 `not_submitted`; writes `feedback` raw, status `RETURNED|REVIEWED`, `reviewedAt`, notifies (v1 copy for reviewed; `"{title} was returned for revision"` for returned). File read: GET `/:publicId/files/:fileId` (l.629+, `canViewSubmission`, streams the blob, needs the bearer token) — **no mobile hook calls it**.
- Renders: invalid id → `EmptyState "Not found" / "That submission link isn't valid."`; LoadingState; `ErrorState "Couldn't load this submission."`; title (Text title); `{name ?? email}{ · group}` label; one status line via `statusLine()` (`Reviewed` / `Returned for revision` / `Submitted late` / `Submitted` / `Draft`); `Card` with `text ?? "No text submitted."`; `Card "Feedback"` whenever feedback exists (**even when canReview**); `Verdict` when `canReview`: heading `Update feedback`/`Add feedback`, `Input label="Feedback" multiline`, error `Couldn't record the review. It may not have been submitted yet.`, `Button "Update review"/"Mark reviewed"` and `Button "Return for revision"` (secondary); success → `router.back()`.
- Not rendered today: due date, submitted date, Late badge as a badge, assignment prompt, attachments (files array ignored).
- Legacy imports: `../../../src/theme` (useTheme), `../../../src/ui` (Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text).

### c) Data mapping
| v1 element | v2 source (`SubmissionDetail`) |
|---|---|
| assignmentTitle | `assignmentTitle` ✓ |
| `{name ?? email} · {group}` | `studentName`, `studentEmail`, `groupName` ✓ (group from enrolment, C9) |
| status badge | `status` ✓ |
| Late badge | `isLate` ✓ (C4) |
| `Submitted {MMM d, h:mm a}` | `submittedAt` ✓ (new helper; device zone) |
| `Due {MMM d, h:mm a}` | `assignmentDueAt` ✓ (instant only; no org day/time on this schema → device zone, X13 gap like batch 2) |
| Assignment prompt | `assignmentDescription` ✓ → `RichTextView html={storedTextToHtml(desc)}` (`src/lib/stored-text.ts`; descriptions hold v1 HTML or v2 plain text) |
| Submission text / `No written response.` | `text` (plain) → `RichTextView html={text ? plainTextToHtml(text) : null} emptyText="No written response."` ✓ (as the student editor does) |
| Attachments rows (name, KB) | `files[].originalName/sizeBytes` ✓ (`id`, `mimeType` also present; `storagePath` deliberately not on the wire, spec 08 D7) |
| download note | constant (copy ruling, see below) |
| canReview | `canReview` ✓ (C4: drives UI only) |
| alreadyReviewed | `reviewedAt !== null` ✓ |
| initialFeedback | `feedback ?? ""` ✓ (plain text) |
| `Feedback` card when !canReview | `feedback` ✓ |
| `Mark as reviewed` | `useReviewSubmission.mutate({feedback})` ✓ |
| error box `{result.error}` | `apiErrorMessage(review.error, fallback)` (`src/lib/api-error`) ✓ |

GAP / V2-ONLY / conflicts:
- **V2-ONLY (needs placement ruling): "Return for revision"** — v1 has no such control (spec 08 D11 recommended building it; shared schema `reviewSubmissionRequestSchema` documents it; tested). Proposal: keep, as `Button variant="outline"` to the left of the primary in v1's `flex justify-end` row (`flex-row justify-end gap-2`), label `Return for revision`.
- **V2-ONLY behaviour: `router.back()` after a verdict** — v1 stays on the page and refreshes (title flips to "Update feedback"). Tested (l.54). Ruling: keep back-navigation, or match v1 (stay; the invalidation already refetches the detail).
- **Conflict: v2 shows the `Feedback` card while the reviewer also has the editor** — v1 shows that card only when `!canReview`. Match v1.
- **Rich-text editor vs plain-text wire**: v1 uses `RichTextEditor`; v2 receives `feedback` via `htmlToPlainText` and stores what it is sent raw (no `plainTextToHtml` on write, unlike forum/notes) into a column v1 renders as HTML. A ported `RichTextEditor` would round-trip HTML → plain text on reload and lose formatting. Same call as B2-16: plain `Textarea` (`min-h-32`, placeholder `What did the student do well? What could be stronger?`, `accessibilityLabel="Feedback"` to keep tests) inside v1's card. Flag the raw-write asymmetry for the backend (should `plainTextToHtml` feedback on write so v1 renders line breaks; X2/X3, C11).
- **File reading: GAP(mobile hook)** — backend can stream files (`GET /:publicId/files/:fileId`, bearer-auth), but there is no hook/download (Linking.openURL cannot carry the token; needs expo-file-system download + share, or a signed URL). v1 itself does not open files (rows are inert + "File download isn't wired up in the demo build — see TODO.md."). For parity: inert rows + note; the note's copy (mentions TODO.md, "demo build") needs a ruling — suggest keeping v1's row markup and either v1's text verbatim or v2 copy like "Files can't be opened in the app yet." Uploads off does not affect this screen (reviewers never upload; `canUploadFiles` unused here).
- Copy: `Mark reviewed` → v1 `Mark as reviewed`; pending label `Saving…` (v2 Button `loading` spinner today); status line → badges; `No text submitted.` → `No written response.`; v2 error fallback `Couldn't record the review. It may not have been submitted yet.` (V2-ONLY copy for the 409; v1 only ever showed `Invalid feedback.` — keep v2 fallback via `apiErrorMessage`).
- Not-found / forbidden: v1 404 page / redirect to the queue (spec 08 D13 recommends a rendered state); v2 `RouteError`-style error (`canViewSubmission` 403 → error) and `Not found` for a bad param. V2-ONLY, keep (use `RouteError` with leader copy for load errors).
- Spec 08 D10 (require non-empty feedback, refuse DRAFT review): v2 refuses DRAFT→REVIEWED (409) but accepts empty feedback, like v1. No UI conflict.
- Spec 14 D9: forum posts are reviewable in v2 and the student sees the feedback (kept per gaps-batch-2). v1's leader detail shows a forum post like any submission (dark shot) — no conflict.
- RETURNED status badge (warning) renders through `SubmissionStatusBadge` — v1 had the style but no producer; fine.

### d) Components
- Ported: `Card`/`CardHeader`/`CardTitle`/`CardContent` (`className="mb-4"` → use `gap-4` parent + `mb-4`, or explicit `gap` to reproduce 32px spacing), `Badge` (warning, outline), `SubmissionStatusBadge`, `RichTextView`, `Textarea`, `Button` (default + outline), `PageTitle` (size `page`: v1 detail h1 is `text-2xl`, not `text-xl`), `RouteSkeleton`. Icon `File` via `iconWithClassName(FileIcon)` — the student editor in `assignment/[id]/index.tsx` already has the identical file-row markup to copy (but v1 here uses `bg-muted/40`, the student one `bg-card`).
- `RichTextEditor` is ported (`src/design/ui/rich-text-editor.tsx`, tentap WebView) but should **not** be used here (plain-text wire, see above).
- Needs port: `components/assignments/submission-review-form.tsx` (65 l) → e.g. `src/design/submissions/submission-review-form.tsx` (keeps `useReviewSubmission`; adds the V2-ONLY return button). Header + badges + prompt + submission cards are inline in page.tsx (no component).
- New formatter `MMM d, h:mm a` (shared with §1 and §3).

### e) Tests — `src/__tests__/submission-review.test.tsx` (117 l)
- Behaviour (keep): POST `/api/v1/submissions/aaa1111111/review` with `{ feedback: "Good work." }` (l.49-53); back after success (l.54 — only if the back-nav ruling keeps v2); redo review prefills the field and posts `{feedback:"Even better."}` (l.65-73); return-for-revision posts `{feedback, returnForRevision: true}` (l.84-89); 409 keeps the user on screen with a message (l.92-101, `mockBack` not called); `canReview:false` hides controls (l.103-111); header subtitle `Test student · Group A` (l.113-117 — v1 string identical, keep).
- Markup/copy (will change): `"Submitted late"` (l.44 → `getByText("Submitted")` + `getByText("Late")`; note `Submitted {date}` outline badge also contains "Submitted" — use exact match); `"Mark reviewed"` (l.47, 66, 97, 109 → `Mark as reviewed`); `"Update review"` / `"Update feedback"` (l.65, 67, 70 — v1 copy identical, keep); `getByLabelText("Feedback")` (l.46, 68, 69, 81, 110 — keep by giving the Textarea `accessibilityLabel="Feedback"`); `"Return for revision"` (l.82, V2-ONLY copy); `/Couldn't record the review/` (l.99, V2-ONLY fallback copy); `"the student's work"` (l.43, 108 — still rendered as text through RichTextView, keep). Fixture already carries `files: []`, `assignmentDescription: null`; add a case for attachments + prompt if wanted.
- Also reaching this route: `student-detail.test.tsx` l.174 (push `/submission/[publicId]`), `assignment-staff-detail.test.tsx` l.100, `dashboard.test.tsx` mentor feed — navigation only, unaffected.

---

## 3. Staff side of assignment detail (leader) → `app/(app)/assignment/[id]/index.tsx` (staff branch) + `src/components/assignment-staff-panel.tsx` + `src/components/ForumThread.tsx`

### a) v1
**v1 has no leader page for an assignment.** Leader nav (`lib/navigation.ts:84,92`) offers only `/leader/submissions`; `/admin/...` requires ADMIN/SUPER, `/student/assignments/[id]` requires STUDENT. The leader dashboard's "Assignments" card (`app/leader/dashboard/page.tsx:305-330`: Pending review / Reviewed counts) links only to `/leader/submissions` ("View all"). v1 leaders also **cannot read a forum thread at all** (the only forum UI is on the STUDENT page; spec 14 R53/D3) and cannot delete comments (`forum-actions.ts:101-123`: author or season admin/SUPER only).

**Closest v1 equivalent: the admin assignment detail page** `app/admin/season/[code]/assignments/[id]/page.tsx` (94 l) + `components/assignments/submission-tracker.tsx` (86 l) + `DataTable` (113 l) + `RichTextView` (53 l). It is what screen-map row `/admin/season/[code]/assignments/[id] → (app)/assignment/[id]/index` maps to, and its tracker's "Open" button links into `/leader/submissions/{publicId}` (spec 08 D13). The leader queue (§1) is the other leader-facing equivalent but is not grouped by assignment.
Shots: `shots/admin/{light,dark}/admin__season__code__assignments__id.png` (+ `__dialog-0..2`, shell chrome). There is no leader shot for this screen.

Render tree (admin page, ADMIN/SUPER; leader would see the same minus the edit button):
- `div.flex flex-col gap-4`
  - `div.flex items-start justify-between gap-4`
    - `div` > `h1.text-2xl font-black text-brand-navy-900 dark:text-foreground` title · `p.mt-1 text-sm text-muted-foreground` → dueAt ? `Due {format(dueAt,"EEE, MMM d, yyyy · h:mm a")}` : `No due date`
    - `Button variant="outline"` → Link `/admin/season/{code}/assignments/{id}/edit` `Edit assignment` (always shown to admins; **no delete control** in v1, R80)
  - description → `Card.mb-4` > `CardContent.pt-6` > `RichTextView html={description}` (no title)
  - badges `div.mb-4 flex flex-wrap gap-2`
    - `Badge variant="secondary"` `{submitted}/{tracker.length} submitted` (submitted = status !== PENDING → **counts DRAFTs**, spec 07 R43)
    - isAllGroups ? `Badge variant="outline"` `All students` : `Badge variant="outline"` `{groupIds.length} group(s)`
    - maxFileSizeMb → `Badge variant="outline"` `Files up to {n} MB`
    - sessionTitle → `Badge variant="outline"` `Session: {sessionTitle}`
  - `SubmissionTracker rows reviewBasePath="/leader/submissions"` → `DataTable`:
    - empty → `p.rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground` `No students targeted by this assignment.`
    - phone list (same shell as §1: `rounded-2xl border border-border/60 bg-card shadow-soft` > `ul.divide-y divide-border/60` > `li.flex min-h-11 items-center gap-3 px-4 py-3`), rows ordered group name then student name (R54), **flat — no group headers**:
      - primary: `div.flex flex-col` > `span.font-medium` `name ?? email` · `span.text-xs text-muted-foreground` `{groupName · }{email}`
      - meta (`·`-separated): Status `div.flex items-center gap-1.5` > PENDING ? `Badge variant="outline"` `Pending` : `SubmissionStatusBadge` (DRAFT shows "Draft") + isLate `Badge variant="warning"` `Late` · Submitted `span.text-sm text-muted-foreground` `MMM d, h:mm a` | `span.text-sm italic text-muted-foreground` `—`
      - action (header ""): `div.flex shrink-0 items-center gap-1` > submissionPublicId ? `Button variant="outline" size="sm"` → Link `/leader/submissions/{publicId}` `Open` : `span.text-xs text-muted-foreground` `—`
- md:/lg: dropped: the table branch; CardContent `md:p-6 md:pt-0` (here `pt-6` is explicit and stays).

Forum (for the V2-ONLY staff thread): v1 `components/forum/forum-view.tsx` (249 l) post card — see batch-2 inventory-D §2 for full classes; only the student renders it. The delete control there is `c.authorUserId === currentUserId` only (`Button variant="ghost" size="icon-xs" aria-label="Delete comment"` > `Trash2`), immediate, no confirm.

### b) v2 current
- `app/(app)/assignment/[id]/index.tsx` (312 l): student branch is finished (ShellFrame, v1 markup). **Staff branch** (l.282-311, non-STUDENT): legacy `Screen scroll` > `EmptyState "Not found" / "That assignment link isn't valid."` | `LoadingState` | `ErrorState "Couldn't load this assignment."` | `Text title` + label `Due {formatOrgDue(dueOrgDay,dueOrgTime)}` / `No due date` + ` · Overdue`; description as plain `Text` (raw — v1 HTML descriptions show tags); `<AssignmentStaffPanel detail>`; FORUM → `<ForumThread assignmentId>`.
  - Hooks (keep): `useAssignmentDetail(id)` → `queryKeys.assignments.detail(id)`, GET `/api/v1/assignments/{id}`, parse `assignmentDetailSchema`; `useSessionStore` role.
  - Legacy imports in that branch: `../../../../src/theme` (useTheme), `../../../../src/ui` (EmptyState, ErrorState, LoadingState, Screen, Text).
- `src/components/assignment-staff-panel.tsx` (160 l):
  - Hooks (keep): `useSeasonGroups(isAllGroups ? null : seasonId)` (names for targeting); `useAssignmentTracker(id)` (`src/hooks/use-assignments.ts:73`) → `queryKeys.assignments.tracker(id)`, GET `/api/v1/assignments/{id}/tracker`, parse `assignmentTrackerSchema`; only asked for `TRACKER_ROLES = SUPER, ADMIN, LEADER` (server narrows a leader to own groups; refuses MENTOR); `useDeleteAssignment()` (DELETE `/api/v1/assignments/{id}`, then `router.replace("/assignments")`).
  - Renders: Card with `Assigned to: {targetLabel}` (group names, "+ N more"), `configLabel(detail)` (`Forum · at least N words · peer comments on` / `Standard · no file uploads` / `Standard · files up to N MB (PDFs, …)`), `Linked session: {title}`; `canManage` → `Edit` (secondary, push `/assignment/[id]/edit`) + two-tap `Delete assignment` → `Really delete?` with server error text; TrackerCard: heading `Submissions`, `{submittedCount} of {expectedCount} submitted`, empty `No students are targeted by this assignment.`, rows **grouped** by `groupTrackerRows` with headers `{groupName} ({n})` (`No group` last), row = name ?? email + `{trackerStatusLabel} · Late` (`Not started` for PENDING), pressable → `/submission/[publicId]` when a submission exists.
  - Labels in `src/lib/assignment-labels.ts` (targetLabel, trackerStatusLabel, configLabel, groupTrackerRows; covered by `assignment-labels.test.ts`).
  - Legacy imports: `../theme` (useTheme), `../ui` (Button, Card, ErrorState, LoadingState, Text).
- `src/components/ForumThread.tsx` (333 l, already on design/ui): staff-relevant parts — `ComposeCard` returns null when `own === null` (staff have no own post); `CommentRow` shows `Trash2` delete when server `comment.canDelete` (backend `canDeleteForumComment`, `lib/permissions.ts:577-602`: author, SUPER, season admin, **or the leader of the author's group**), opens `ConfirmDialog "Delete comment?" / "This removes your comment for everyone." / "Delete"`; root shows, for `LEADER|ADMIN|SUPER` when not locked, `Text.text-xs text-muted-foreground` "You can remove comments here. Removing a whole response isn't supported yet — ask the author to edit it." Hooks: `useForumThread(id, true)` (`queryKeys.forum.thread(id)`, GET `/api/v1/assignments/{id}/forum`), `useForumComments`, `usePostComment` (shown only when `post.canComment`), `useDeleteComment` (DELETE `/api/v1/forum/comments/{id}`).
- How a v2 leader gets here: notification deep links (`src/lib/notification-route.ts`), and the staff `/assignments` list (not in the leader nav; reachable from StaffSeason's "Assignments" button `app/(app)/season.tsx:80`). Not from the queue or the review screen.

### c) Data mapping (v1 admin page → v2)
| v1 element | v2 source |
|---|---|
| title | `detail.title` ✓ |
| `Due EEE, MMM d, yyyy · h:mm a` / `No due date` | `detail.dueOrgDay` + `dueOrgTime` ✓ (org clock, X13) → `format(dayKey,"EEE, MMM d, yyyy")` + `formatWallTime` (`formatWeekdayDayYear` + `formatWallTime` exist) |
| `Edit assignment` button | `detail.canManage` ✓ (false for a leader → hidden; matches v1 leader having no edit) |
| description card | `detail.description` → `RichTextView html={storedTextToHtml(...)}` ✓ |
| `{submitted}/{total} submitted` | `tracker.submittedCount` / `tracker.expectedCount` ✓ — v2 excludes DRAFTs (spec 07 R43 fix); for a leader the counts cover own groups only |
| `All students` / `{n} group(s)` | `detail.isAllGroups`, `detail.groupIds.length` ✓ (v2 also has names via `useSeasonGroups` → `targetLabel`, V2-ONLY) |
| `Files up to {n} MB` | `detail.maxFileSizeMb` ✓ |
| `Session: {title}` | `detail.sessionTitle` ✓ |
| tracker row name/email/group | `rows[].name/email/groupName` ✓ |
| `Pending` / status badge / `Late` | `rows[].status` (`PENDING` sentinel) / `isLate` ✓ |
| submitted date | `rows[].submittedAt` ✓ (new `MMM d, h:mm a` helper) |
| `Open` → review | `rows[].submissionPublicId` → `/submission/[publicId]` ✓ |
| empty tracker | constant ✓ |

GAP / V2-ONLY / conflicts:
- **Ruling needed: which v1 screen the leader's staff branch copies.** There is no v1 leader screen; the admin detail (above) is the closest. Recommend the admin markup for every staff role (ADMIN/SUPER need it anyway — screen-map row 90 is batch 3 too), with `Edit assignment` gated on `canManage`.
- V2-ONLY: the whole leader access (v1 leaders could not open an assignment, see a tracker or read a forum thread) — spec 07 §10 leader-tracker question resolved for access; spec 14 D3 (staff read access) / D2 (minimum moderation). Keep.
- V2-ONLY: `Delete assignment` (two-tap) — v1 rendered no delete (R80), hidden for leaders anyway (`canManage` false). Style as v1 has none: suggest `Button variant="outline"` destructive text next to `Edit assignment`, or move it into a `ConfirmDialog` (the ported dialog exists) instead of the two-tap.
- V2-ONLY: `configLabel` line (forum min words / comments / MIME list) — v1 shows only `Files up to N MB`. Ruling: drop for v1 parity or keep as extra outline badges.
- V2-ONLY: group section headers `{group} ({n})` in the tracker (REG-84) — v1 is one flat list with the group in each row's second line. Ruling.
- Copy: `Not started` → v1 `Pending` (outline badge); `{x} of {y} submitted` → `{x}/{y} submitted`; `Linked session: …` → `Session: …`; `Assigned to: …` → badge `All students` / `{n} group(s)`; empty `No students are targeted by this assignment.` → `No students targeted by this assignment.`; heading `Submissions` (v2) has no v1 counterpart (v1 tracker has no title).
- Conflict: v2 staff due line `Due Apr 1, 2099, 11:59 PM` + ` · Overdue` (formatOrgDue) vs v1 `Due Wed, Apr 1, 2099 · 11:59 PM` with no overdue suffix.
- Forum moderation (all V2-ONLY): the removal note copy; `ConfirmDialog` description "This removes your comment for everyone." is wrong when a leader removes a **student's** comment (copy fix: e.g. "This removes the comment for everyone."); the leader sees `Delete comment` on group members' comments because `canDelete` is server-computed (fine, C4). v1's delete was immediate with no confirm (B2 kept the confirm).
- Staff branch description is rendered as raw `Text` today → shows v1 HTML tags; use `storedTextToHtml` + `RichTextView` (bug, not a ruling).
- Leader cannot reach this screen from the leader nav, the queue or the review screen. v1 had no route either. Optional V2-ONLY link from the review header (assignment title → `/assignment/[id]`)? Not in v1 — flag only.
- MENTOR: tracker not requested (server refuses) but the thread is shown read-only; v1 mentors had neither. Keep (tested).

### d) Components
- Ported: `DataTable` (tracker), `SubmissionStatusBadge`, `Badge` (secondary/outline/warning), `Button` (outline, outline sm for `Open`), `Card`/`CardContent` (`pt-6`), `RichTextView`, `PageTitle`, `RouteSkeleton`, `ConfirmDialog`, `EmptyState`. `ForumThread` already uses design/ui (finished in batch 2) — only copy tweaks.
- Needs port: `components/assignments/submission-tracker.tsx` (86 l) → replace `TrackerCard` in `assignment-staff-panel.tsx` (keep `useAssignmentTracker`, `TRACKER_ROLES`, the press-to-review behaviour; `Open` button → `router.push`). The admin header/badges row is inline in the page (no component). `groupTrackerRows`/`trackerStatusLabel`/`configLabel`/`targetLabel` become unused if v1 is matched — `assignment-labels.test.ts` would then test dead code (decide: delete or keep for `assignments.tsx`, which uses `targetLabel`).
- `assignment/[id]/index.tsx` staff branch → `ShellFrame` + v1 admin layout (StudentAssignmentDetail shows the pattern).

### e) Tests
- `src/__tests__/assignment-staff-detail.test.tsx` (161 l):
  - Behaviour (keep): no submission editor for staff (l.68-89 intent); not-started row opens nothing, started row pushes `/submission/[publicId]` `abc123defg` (l.91-101 — v1 uses an `Open` button; keep asserting the push via the button or the row); Edit pushes `/assignment/[id]/edit` id 55 (l.109-110); delete only on a second press → DELETE `/api/v1/assignments/55` → replace `/assignments` (l.112-116; changes if a ConfirmDialog replaces the two-tap); 409 `has_submissions` message + disarm (l.119-140); LEADER gets the tracker but no Edit/Delete (l.142-150); MENTOR never requests `/tracker` (l.152-159).
  - Markup/copy (will change): `"Due Apr 1, 2099, 11:59 PM"` (l.74 → `Due Wed, Apr 1, 2099 · 11:59 PM`); `"Assigned to: Group A"` (l.75, 157 → `1 group(s)` badge, or keep as V2-ONLY); `"Standard · files up to 10 MB (PDFs)"` (l.76 → `Files up to 10 MB`); `"Linked session: Week 4"` (l.77 → `Session: Week 4`); `"1 of 2 submitted"` (l.80, 147 → `1/2 submitted`); `"Group A (2)"` (l.83, V2-ONLY header); `"Submitted · Late"` (l.84 → badges `Submitted` + `Late`); `"Not started"` (l.86 → `Pending`); `"Edit"` (l.109, 148 → `Edit assignment`); `"Delete assignment"`/`"Really delete?"` (l.112-139, V2-ONLY copy); `getByText("Sara Student")` press (l.99 → press `Open`). `"noname@jpc.test"` (l.85, 96) stays (name ?? email — but email now also appears in the second line of other rows; check duplicates).
- `src/__tests__/forum-screen.test.tsx` (311 l): every case renders as STUDENT; no staff/moderation assertion exists. `canDelete` → `Delete comment` (l.178-198) and confirm dialog `Delete comment?` (l.200-215) are role-agnostic — keep. A leader moderation test (removal note, deleting a member's comment) is missing (add when the copy is ruled).
- `src/__tests__/assignment-labels.test.ts`: unit tests of the V2-ONLY labels (see d).
- `src/__tests__/assignment-detail.test.tsx`: student branch only — unaffected.

---

## Domain decisions that bear on these screens
- **C4** (derived values server-side): `isLate`, counts, `canReview`, `canManage`, `canDelete` all come from the API — the port must not recompute `submittedAt > dueAt` as v1 did at five sites.
- **C8** (narrow payloads): used to justify the narrow queue item; it does not forbid `studentEmail` for staff (v1 showed it to leaders; the detail returns it). Adding it is a contract change, not a ruling conflict.
- **C9**: group names come from enrolment (queue, detail, tracker) — v1 used `GroupStudent`; values may differ for students who changed group across seasons.
- **C11 / X2-X3**: submission text/feedback travel as plain text → no rich-text editor for feedback (conflicts with v1's `RichTextEditor`; same resolution as B2-16). Backend writes feedback raw (no `plainTextToHtml`) — flag for a backend fix.
- **X13**: due/submitted stamps are formatted from instants in the device zone on the queue and the review screen (no org fields on those schemas); the staff assignment detail has `dueOrgDay/dueOrgTime`.
- **Spec 08 D11** (RETURNED producer) → V2-ONLY "Return for revision" button; **D12** (queue scoped + paginated) → "Load more" and the `pendingOnly` default; **D13** (no redirect on failure) → rendered error; **D10** (empty review allowed) → unchanged.
- **Spec 07 R43/R80** → v2 `submittedCount` excludes drafts (number differs from v1's `x/y`), delete exists only in v2.
- **Spec 14 D2/D3/D9** → staff read the thread, leaders may delete group members' comments, forum posts stay reviewable. All widen v1.
