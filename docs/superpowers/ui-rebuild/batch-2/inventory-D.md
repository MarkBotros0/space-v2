# Inventory D — student: assignments list, assignment detail (+forum), profile

Paths: V1 = `/home/mark/projects/JPC/.v1-reference/app/src`, M = `/home/mark/projects/JPC/space-v2/apps/mobile`, S = `/home/mark/projects/JPC/space-v2/packages/shared/src`.
Shots: `/home/mark/projects/JPC/.v1-reference/shots/student/{light,dark}/student__assignments.png`, `student__assignments__id.png`, `student__profile.png`.
All three v1 pages are wrapped by the shell (top bar + floating tab bar), so render only the page body. None of them use `PageHeader`: each has its own header markup (below).

---------------------------------------------------------------------------
## 1. /student/assignments → M/app/(app)/assignments.tsx (student branch)

### a) v1
Files: `V1/app/student/assignments/page.tsx` (119), `V1/components/students/stat-card.tsx` (76). Server component; no loading or error UI (SSR).

- root `div.flex flex-col gap-3 md:gap-4` (phone: gap-3)
  - `div`
    - `h1.text-2xl font-black text-brand-navy-900 dark:text-foreground`: "Assignments"
    - `p.mt-1 text-sm text-muted-foreground`: "Your current season"
  - IF `rows.length === 0` → `EmptyState` icon=`FileText` title="No assignments yet" description="Check back when your leader posts one."
  - ELSE:
    - `div.grid grid-cols-3 gap-3`, holding 3× StatCard (see the StatCard spec below)
      - StatCard label="Submitted" value=count(status SUBMITTED|REVIEWED), variant white
      - StatCard label="Pending" value=count(PENDING|DRAFT), variant = pending>0 ? "teal" : "white"
      - StatCard label="Reviewed" value=count(REVIEWED), variant white
      - Note: RETURNED is counted in none of the three.
    - `div.rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]`
      - `ul.divide-y divide-border`
        - per row `li.flex items-center gap-3 px-4 py-3 first:pt-4 last:pb-4`
          - dot `span.size-2 shrink-0 rounded-full {dot}`. dot = REVIEWED `bg-success-500` | SUBMITTED `bg-brand-teal-500` | DRAFT `bg-warning-500` | (PENDING/other and dueAt past) `bg-error-500` | else `bg-muted-foreground/30` (RETURNED falls into the last two)
          - `div.flex min-w-0 flex-1 flex-col gap-0.5`
            - Link → `/student/assignments/{id}` `.truncate text-sm font-semibold text-brand-navy-900 hover:underline dark:text-foreground`: `{title}` (single line, truncated with an ellipsis, see shot)
            - IF dueAt: `p.text-xs text-muted-foreground`: `Due {format(dueAt,"MMM d, yyyy")}`, plus ` · in {formatDistanceToNowStrict(dueAt)}` when not past (e.g. "Due Jun 30, 2026 · in 3 months")
          - StatusBadge: REVIEWED `Badge variant="success"` "Reviewed" | SUBMITTED `variant="teal"` "Submitted" | DRAFT `variant="warning"` "Draft" | dueAt past `variant="error"` `Due {format(dueAt,"MMM d")}` (e.g. "Due Mar 13") | else `variant="outline"` "Not started". RETURNED gets the past-due/"Not started" fallback (v1 quirk).
  - The whole row is not pressable; only the title is a link. On RN, make the row a Pressable or keep the title as the touch target.

StatCard spec (`stat-card.tsx`), used by screens 1 and 3:
- container `flex h-full flex-col items-center justify-center gap-1 rounded-2xl p-4 text-center` +
  - white: `border border-border bg-card shadow-[var(--shadow-soft)]`
  - navy: `bg-gradient-to-br from-brand-navy-900 to-brand-navy-700 shadow-[0_4px_20px_rgba(31,50,96,0.25)] dark:from-brand-navy-800 dark:to-brand-navy-600 dark:ring-1 dark:ring-white/10`
  - teal: `bg-brand-teal-100 ring-1 ring-brand-teal-200 dark:bg-brand-teal-950 dark:ring-brand-teal-900`
  - href set: adds `transition-opacity hover:opacity-80` and renders as a Link
- value `p.flex items-center justify-center gap-1 text-3xl font-black leading-none` + white `text-brand-navy-900 dark:text-foreground` / navy `text-white` / teal `text-brand-teal-900 dark:text-brand-teal-100`
- label `p.text-[10px] font-bold uppercase tracking-widest` + white `text-muted-foreground/70` / navy `text-brand-teal-300` / teal `text-brand-teal-700 dark:text-brand-teal-300`
- optional sublabel `p.text-[10px]` + white `text-muted-foreground/70` / navy `text-white/40` / teal `text-brand-teal-600 dark:text-brand-teal-400`

### b) v2 today
- Hooks (keep): `useSessionStore` (role, `scopes.activeSeasonId`); `useStudentAssignments(isStudent ? seasonId : null)` → key `queryKeys.assignments.bySeason(seasonId)`, GET `/api/v1/seasons/{id}/assignments`; pull-to-refresh calls `refetch` (guarded); navigation `router.push({ pathname: "/assignment/[id]", params: { id: String(item.id) } })`. The staff branch (`StaffAssignments`, `useStaffAssignments`, `useSeasonGroups`, `useCurrentSeasonId`) is out of scope; leave it as is.
- Renders: one Card per row, with title (heading) and the label `Due {formatDueDate} · {statusLabel}` (statusLabel: Reviewed/Returned/Submitted/Draft/Overdue/Not started). No header, no stats.
- States: no season → EmptyState "No active season" / "You don't have an active season right now, so there are no assignments to show."; loading → LoadingState; error → ErrorState "Couldn't load assignments. Check your connection and try again."; empty → "No assignments" / "This season doesn't have any assignments yet."
- Old-UI imports: `../../src/ui` (Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text), `../../src/theme` (useTheme). Also `src/lib/format` (formatDayKey, formatDueDate) and `src/lib/assignment-labels`.

### c) Data mapping (`StudentAssignmentListItem`, S/assignment.ts:67: id, title, dueAt, isOverdue, status PENDING|DRAFT|SUBMITTED|REVIEWED|RETURNED, reviewedAt)
- title, id, status → direct.
- Stat counts → computed client-side from `data` (as v1 does). Alternative: the dashboard `assignments.outstandingCount`. Use the list.
- "Due MMM d, yyyy" → `formatDueDate(item.dueAt)` (formats in the device zone; there is no `dueOrgDay` on the student list item, unlike staff. Minor X13 risk, not a hard gap).
- " · in X" → `formatDistanceToNowStrict(parseISO(dueAt))`. There is no helper (formatTimeAgo adds a suffix). Small new helper needed; date-fns is installed.
- Past-due dot/badge → use `item.isOverdue` (server flag, ruling C4; keep the test) in place of `isPast(dueAt)`. Badge text `Due {format(dueAt,"MMM d")}`: needs a "MMM d" formatter (new pattern).
- RETURNED: v1 has no explicit case. V2-ONLY decision: either keep "Returned" (v2 currently does) or follow v1's fallback. Flag for owner; the recommendation is v1 visuals plus a "Returned" badge (warning?). Ambiguous.
- V2-ONLY: no-active-season EmptyState, ErrorState, LoadingState, pull-to-refresh. Keep them, restyled with design EmptyState (`FileText` icon for the list-empty copy).
- Empty copy changes to v1's: "No assignments yet" / "Check back when your leader posts one."

### d) Components
- Ported: `Badge` (variants success/teal/warning/error/outline all exist), `EmptyState` (icon/title/description), `Text`, `Card` (not needed; v1 uses a raw div).
- Needs port: `V1/components/students/stat-card.tsx` (76 lines) to `M/src/design/students/stat-card.tsx` (or similar). It is shared with profile (screen 3) and probably other dashboards. Existing `M/src/components/dashboard/StatTile.tsx` (69) is old-UI and not a faithful port. The navy variant needs a LinearGradient or a fallback; only white and teal are used here.

### e) Tests: `M/src/__tests__/assignments-screen.test.tsx` (85)
- KEEP (behaviour): GET `/api/v1/seasons/7/assignments` called; title "Essay one" shown; press title → `mockPush({pathname:"/assignment/[id]", params:{id:"41"}})`; no season → "No active season" and no API call; overdue decided by `isOverdue`, not a date compare (future dueAt with isOverdue true).
- CHANGES: `getByText(/Not started/)` still works (the outline badge copy is the same). `findByText(/Overdue/)` must become the v1 badge copy `Due Apr 1` (keep the intent: future dueAt plus flag ⇒ error badge). The press target must be the title text (still works if the row or title is pressable).

---------------------------------------------------------------------------
## 2. /student/assignments/[id] → M/app/(app)/assignment/[id]/index.tsx (student branch) + M/src/components/ForumThread.tsx

### a) v1
Files: `V1/app/student/assignments/[id]/page.tsx` (146), `V1/components/assignments/student-submission-form.tsx` (280), `V1/components/forum/forum-view.tsx` (249, the only forum component), `V1/lib/forum.ts` (countWords), action errors in `V1/lib/submission-actions.ts` and `V1/lib/forum-actions.ts`.
Server: if the student is not targeted, it redirects to /student/assignments. `ensureDraftSubmission` ALWAYS creates a DRAFT row on page load (both branches).

#### STANDARD branch
- root `div.flex flex-col gap-3 md:gap-4`
  - `div`
    - Link → /student/assignments `.text-xs font-semibold text-brand-teal-700 hover:underline dark:text-brand-teal-300`: "← Assignments"
    - hero `div.mt-2 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]`
      - `h1.text-xl font-black text-brand-navy-900 dark:text-foreground`: `{title}`
      - `div.mt-2 flex flex-wrap gap-1.5`
        - IF dueAt: `Badge variant={past ? "error" : "warning"}`: past → `Due {format(dueAt,"MMM d, yyyy")}` (shot: "Due Mar 13, 2026"); else → `Due in {formatDistanceToNowStrict(dueAt)}` (e.g. "Due in 5 days")
        - IF no dueAt: `Badge variant="outline"` "No due date"
  - IF description: `div.rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]`
    - `p.mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70`: "Brief"
    - `RichTextView html={description}`
  - StudentSubmissionForm: root `div.flex flex-col gap-4`
    - dueBanner (hidden when no dueAt or status REVIEWED):
      - past: `div.rounded-md bg-error-50 px-3 py-2 text-sm text-error-800` "Past due — submitted work will be marked late."
      - <24h left: `div.rounded-md bg-warning-50 px-3 py-2 text-sm text-warning-800` `Due in {formatDistanceToNowStrict(dueAt)}`
      - else: `div.rounded-md bg-info-50 px-3 py-2 text-sm text-info-800` same copy
    - `Card`
      - `CardHeader className="flex flex-row items-center justify-between"`
        - `CardTitle className="text-base"`: "Your submission"
        - IF status !== DRAFT: `Badge variant={REVIEWED ? "success" : "info"}` → "Reviewed" : "Submitted" (RETURNED also shows "Submitted"/info, a v1 quirk)
      - `CardContent className="flex flex-col gap-4"`
        - readOnly = `REVIEWED || (SUBMITTED && dueAt past)`
        - readOnly → `RichTextView html={text} emptyText="No written response."`; else `RichTextEditor value onChange placeholder="Write your response…"` (shot: toolbar B I S bullet-list ordered-list link | undo redo)
        - IF acceptsFiles (`maxFileSizeMb != null`): `div.flex flex-col gap-2`
          - `p.text-sm font-medium`: `Files (max {N} MB each)` (or `Files ` when N is falsy)
          - `ul.flex flex-col gap-1.5`, per file `li.flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm`
            - `span.inline-flex items-center gap-2 truncate`, holding the `File` icon `size-4 shrink-0 text-muted-foreground` and `span.truncate` `{originalName}`
            - `span.shrink-0 text-xs tabular-nums text-muted-foreground`: `{(sizeBytes/1024).toFixed(1)} KB`
            - IF !readOnly: `Button variant="ghost" size="icon-xs"` icon `X`, aria-label `Remove {originalName}`, disabled while pending
          - IF !readOnly: native `<input type="file" class="text-sm">` with an accept list from the categories
        - error `p.rounded-md bg-error-50 px-3 py-2 text-sm text-error-800` `{error}` (server strings: "No file provided." / "File exceeds {N} MB." / "File type {t} not allowed." / "File not found.")
        - info `p.rounded-md bg-success-50 px-3 py-2 text-sm text-success-800`: "Draft saved." | "Submitted!" | "Uploaded."
        - IF !readOnly: `div.flex flex-col-reverse gap-2 sm:flex-row sm:justify-end` (phone: column-reverse, so Submit sits ABOVE Save draft, both full width; see shot)
          - `Button variant="outline"` (disabled while pending): pending "Saving…" | isSubmitted (SUBMITTED/REVIEWED/RETURNED) "Save changes (draft)" | "Save draft"
          - `Button` (default) disabled when `pending || (text.trim()==="" && files.length===0)`: pending "Submitting…" | isSubmitted "Re-submit" | "Submit"
          - (v1 bug: a single `pending` flag drives both labels.)
    - IF feedback: `Card`, holding `CardHeader` > `CardTitle className="text-base"` "Leader feedback", then `CardContent` > `RichTextView html={feedback}`

#### FORUM branch
- root `div.flex flex-col gap-3 md:gap-4`
  - `div`
    - the same back Link "← Assignments"
    - hero `div.mt-2 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]`
      - `div.mb-2 flex items-center gap-2` > `Badge variant="teal"` "Forum"
      - `h1.text-xl font-black text-brand-navy-900 dark:text-foreground` `{title}`
      - NO due badge in the forum branch
  - IF description: same card as Brief but the label reads "Question"
  - ForumView: `div.flex flex-col gap-4`
    - `Card` (compose)
      - `CardHeader className="flex flex-row items-center justify-between"`: `CardTitle className="text-base"` "Your response"; IF posted (`ownStatus !== "DRAFT"`) `Badge variant="success"` "Posted"
      - `CardContent className="flex flex-col gap-3"`
        - `RichTextEditor value onChange placeholder="Share your thoughts…"`
        - `div.flex items-center justify-between text-xs` > span (meetsMin ? `text-success-700 dark:text-success-300` : `text-muted-foreground`): `{words} {word|words}` + (min>0 ? ` · minimum {min}` : ""). Examples: "0 words · minimum 5", "1 word"
        - error `p.rounded-md bg-error-50 px-3 py-2 text-sm text-error-800` (server: "Please write at least {min} words (you have {n}).", "Response not found.", "Not a forum assignment.")
        - info `p.rounded-md bg-success-50 px-3 py-2 text-sm text-success-800`: "Posted!" | "Response updated."
        - `div.flex justify-end` > `Button` disabled `pending || !meetsMin`: pending "Posting…" | posted "Update response" | "Post response"
    - locked → `EmptyState icon=Lock title="Post to unlock the discussion" description="Share your own response first to see what your group-mates wrote."`
    - no posts → `EmptyState icon=MessagesSquare title="No responses yet" description="You're the first in your group to post. Check back soon."`
    - else `div.flex flex-col gap-3`
      - `p.text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70`: `Group discussion · {posts.length}`
      - per post: `Card` > `CardContent className="flex flex-col gap-3 pt-6"`
        - `div.flex items-center gap-2.5`
          - `Avatar className="size-9"` (AvatarImage if a URL exists; `AvatarFallback` initials = first letters of the first two words, upper-case, or "?")
          - `div.flex flex-col`, holding `span.text-sm font-semibold text-foreground` `{authorName}` and, IF submittedAt, `span.text-xs text-muted-foreground` `{formatDistanceToNowStrict(submittedAt)} ago` (e.g. "3 days ago")
        - `RichTextView html={post.text} emptyText="No written response."`
        - IF allowComments: `div.flex flex-col gap-3 border-t border-border pt-3`
          - per comment `div.flex items-start gap-2.5`, holding Avatar size-9 and `div.flex flex-1 flex-col rounded-lg bg-muted/50 px-3 py-2`
            - `div.flex items-center justify-between gap-2`, holding `span.text-xs font-semibold text-foreground` `{authorName}` and `span.flex items-center gap-2`: `span.text-[10px] text-muted-foreground` `{distance} ago` plus, IF own comment, `Button variant="ghost" size="icon-xs"` `Trash2` aria-label "Delete comment" (immediate, no confirm)
            - `p.whitespace-pre-wrap text-sm text-foreground` `{body}`
          - composer `div.flex items-end gap-2`: `Textarea placeholder="Write a comment…" rows={1} className="min-h-10"` and `Button size="icon"` `Send` aria-label "Post comment" (disabled pending/empty)
          - error `p.text-xs text-error-700` (server: "Post your own response before commenting.", "Comment not found.", "Response not found.", zod message or "Invalid comment.")

md:/lg:-only details dropped on phone: `md:gap-4`, the `sm:flex-row sm:justify-end` button rows.

### b) v2 today
- Screen (`index.tsx`, 162): `useLocalSearchParams` id (invalid → EmptyState "Not found" / "That assignment link isn't valid."); `useSessionStore` isStudent; `useAssignmentDetail(id)` → key `queryKeys.assignments.detail(id)`, GET `/api/v1/assignments/{id}`; loading/error ("Couldn't load this assignment."). Renders title (Text title), the label `Due {formatOrgDue(dueOrgDay,dueOrgTime)}` + " · Overdue" or "No due date", description as plain Text. Student branch: FORUM → `<ForumThread>`, else `SubmissionSection`. Staff branch (`AssignmentStaffPanel`) is out of scope.
- SubmissionSection: `mySubmission === null` → Card "Your submission" + Button "Start working" → `useEnsureSubmission(detail.id)` (PUT `/api/v1/submissions/by-assignment/{id}`, invalidates detail); error "Couldn't start your submission. Try again."
- SubmissionEditor: `useSubmissionDetail(publicId)` (key `queryKeys.submissions.detail(publicId)`, GET `/api/v1/submissions/{publicId}`); `useSaveSubmission(publicId, assignmentId)` (PATCH `{text, submit?}`; invalidates the submission detail, the assignment detail, `assignments.lists()`). Status line: Reviewed / Returned for revision / Submitted late / Submitted / Draft. Feedback as plain Text. editable = DRAFT|RETURNED. Input label "Your answer" (multiline). Notice "This assignment expects a file, but attachments aren't available in the app yet." when `maxFileSizeMb!==null && !canUploadFiles`. Error "Couldn't save. Check your connection and try again." Buttons "Save draft" (secondary) and "Submit" (disabled when nothingToSubmit). No success message.
- ForumThread (259): `useForumThread(assignmentId, true)` (infinite; key `queryKeys.forum.thread(id)`, GET `/api/v1/assignments/{id}/forum`, `fetchNextPage` → "Load more"); `useSubmitForumResponse` (PUT `/forum/response` `{text}`); `usePostComment` (POST `/forum/posts/{publicId}/comments`); `useDeleteComment` (DELETE `/api/v1/forum/comments/{id}`); `useForumComments(id, postPublicId, expanded)` (infinite; "Show all comments"/"{n} more"/"More comments"). All mutations invalidate the thread, comments and the assignment detail. Compose: own feedback block "Feedback from your leader" + reviewedAt date; Input "Your response"; counter `{words} / {min} words`; client gate `words < max(1,min)`; error via `apiErrorMessage`. Locked → "Post to unlock the discussion" / "You'll see everyone else's responses once you post yours."; empty → "No one has posted yet." / "Responses from the group appear here." Comment delete is a two-tap "Delete"→"Confirm delete" driven by `canDelete`; composer Input "Add a comment" + Button "Comment" gated by `post.canComment`. Staff note on removal (staff only).
- Old-UI imports: index.tsx uses `src/ui` (Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text) and `src/theme`; ForumThread uses `../ui` (same set) and `../theme`. `src/lib/format` (formatOrgDue, formatDate), `src/lib/api-error`.

### c) Data mapping
`AssignmentDetail` (S/assignment.ts:102), `SubmissionDetail` (S/submission.ts:42), `ForumView/ForumPost/ForumComment/ForumOwnResponse` (S/forum.ts).
- Back link "← Assignments" → `router.back()` or `router.push("/assignments")` (typed route). Check whether the (app) stack shows a native header for this route; v1 has none.
- title → `detail.title`. "Forum" badge → `detail.type === "FORUM"`.
- Due badge: past ⇒ `detail.isOverdue` (server) with `Due {formatDayKey(dueOrgDay)}` (gives "MMM d, yyyy" in the org day; good); future ⇒ `Due in {formatDistanceToNowStrict(detail.dueAt)}` (needs `dueAt`; available); none ⇒ "No due date". v2 currently adds the org TIME (`formatOrgDue`), which v1 does not show.
- Brief/Question → `detail.description`. This is raw stored HTML (backend `queries/assignments.ts:152` passes it through), so `RichTextView html` is right. Test copy "Write about the thing." still renders.
- dueBanner: past ⇒ `isOverdue`; urgent (<24h) ⇒ `dueAt` minus now (device clock; fine for a relative value); hidden when status REVIEWED.
- Status badge → `sub.status` (SubmissionDetail). Late: v1 has no "late" badge on this screen. V2-ONLY: `isLate` ("Submitted late", tested). Recommendation: keep it as an extra Badge or fold it into copy. Flag.
- readOnly/editable: v1 = REVIEWED, or SUBMITTED-and-past-due, is read-only; DRAFT, RETURNED and SUBMITTED-before-due are editable ("Re-submit", "Save changes (draft)"). v2 = only DRAFT|RETURNED editable. The server PATCH has NO status guard (routes/submissions.ts:263+), so v1 behaviour is achievable client-side. DIVERGENCE: decide. Note that saving on SUBMITTED does not demote the status in v2 (only `submit:true` re-stamps).
- Text: GAP/RISK. `SubmissionDetail.text` is returned as PLAIN TEXT (`htmlToPlainText`, routes/submissions.ts:239), but PATCH stores `text` verbatim. Using the ported `RichTextEditor` (emits HTML) makes the round trip lossy: HTML is saved, plain text comes back on reload, formatting is lost and the editor is re-seeded with plain text. Either the API must return the HTML (contract change) or the editor stays a plain Textarea. Same for readOnly `RichTextView html={text}`: it gets plain text (renders, but newlines collapse unless converted with `plainTextToHtml`).
- feedback → `sub.feedback` (plain text) in the "Leader feedback" card. Use `RichTextView html={plainTextToHtml(feedback)}` or Text with whitespace preserved.
- Files list → `sub.files[]` (originalName, sizeBytes, mimeType). "(max N MB each)" → `detail.maxFileSizeMb`; acceptsFiles → `maxFileSizeMb !== null`.
- Remove-file X → GAP in mobile: backend `DELETE /api/v1/submissions/:publicId/files` exists (routes/submissions.ts:577), but there is no hook in `use-submission.ts`.
- File picker → GAP (uploads disabled; `sub.canUploadFiles === false`). Keep v2's explanatory notice (V2-ONLY copy) in place of v1's `<input type=file>`.
- Info messages "Draft saved." / "Submitted!": v2 has no success state today. Derive from `save.isSuccess` plus the last variables. Error box: v2 copy "Couldn't save…" vs v1 server strings; use `apiErrorMessage(save.error, …)` (server `empty_submission` "Write a response or attach a file before submitting.").
- Draft row creation: v1 auto-creates the draft on load; v2 ruling C6 = nothing created up front, with an explicit "Start working" button (V2-ONLY). For v1 look: render the editor immediately when `mySubmission===null`, and on the first Save/Submit call `ensure.mutateAsync()` then PATCH. The hooks are keyed by publicId, so a `useSaveSubmission` keyed on a not-yet-known publicId needs a small wrapper. Flag for the plan.
- Forum compose:
  - "Your response" → `view.own`
  - "Posted" badge → `own.posted`
  - counter → `countWords` (shared) and `view.minWords`. Copy changes to v1's `{n} word(s) · minimum {min}`. Keep the client gate `max(1,min)` (D-14.5; v1 allowed 0).
  - Button label → `own.posted`
  - info "Posted!"/"Response updated." → from mutation success (new)
- Forum text RISK: `PUT /forum/response` runs `plainTextToHtml` on the body (routes/forum.ts:99, escapes `<`), and `own.text`/`post.text` come back as plain text. A RichTextEditor that sends HTML would store escaped literal tags. The compose box must stay plain text (Textarea), or the contract must change. v1 visually uses RichTextEditor (toolbar).
- Peer post: authorName → `post.authorDisplayName`; avatar URL → GAP (no `authorAvatarUrl` in ForumPost/ForumComment; use initials only, which matches v1 when there is no avatar); "{x} ago" → `formatDistanceToNowStrict(submittedAt)` + " ago" (`formatTimeAgo` gives the same "3 days ago"); text → `post.text` (plain) shown through `RichTextView` with `plainTextToHtml`, or Text.
- Comment: `authorDisplayName`, `body`, `createdAt` ("ago"); trash shown when `comment.canDelete` (v1 = own comment; v2's server answer is a superset, so keep `canDelete`). v1 deletes immediately; v2 uses a two-tap confirm (V2-ONLY). Could use `ConfirmDialog`, or drop the confirm to match v1. Flag.
- Composer: v1 shows it when `allowComments`; v2 additionally gates on `post.canComment` (keep).
- "Group discussion · N": v1 N = all posts loaded; v2 is paginated, so N = loaded count only. GAP: there is no total post count in ForumView. Accept loaded count, or add a total.
- V2-ONLY forum: own leader feedback block (spec 14 D9, tested); pagination "Load more" and comments "{n} more"/"Show all comments"/"More comments" (`commentCount`); staff removal note (staff only, out of scope); due date on the forum screen (v1 hides it; test asserts "Due Apr 1, 2099", D10). Owner call: keep or drop for exact match.

### d) Components
- Ported (src/design/ui): Badge (teal/success/warning/error/outline/info), Card/CardHeader/CardTitle/CardContent, Button (variants ghost/outline/default; sizes icon-xs/icon), RichTextView (`html`, `emptyText`), RichTextEditor (`value`/`onChange`(html)/`placeholder`), Textarea, Avatar (+fallback; `className="size-9"`), EmptyState (icon/title/description), ConfirmDialog, FileUpload (unused; uploads off), SubmissionStatusBadge (exists; check whether it fits; v1 page uses raw Badges).
- Needs port (non-ui): `V1/components/assignments/student-submission-form.tsx` (280), `V1/components/forum/forum-view.tsx` (249, includes ForumPostCard and PersonAvatar). These become the replacement bodies for `SubmissionEditor` and `ForumThread.tsx` while keeping the v2 hooks. Icons from lucide-react-native: File, X, Lock, MessagesSquare, Send, Trash2.

### e) Tests
`assignment-detail.test.tsx` (112):
- KEEP: GET `/api/v1/assignments/41`; title "Essay one" and description text present.
- MAY CHANGE: "Solid work." feedback from REVIEWED (keep the intent; it now renders in the "Leader feedback" card); `getByText("Reviewed")` still matches the v1 badge. "Submitted late" is V2-ONLY copy and will change if late is dropped or moved.

`submission-editor.test.tsx` (175):
- KEEP: PUT by-assignment idempotent start (trigger may change from the "Start working" button to the first save); PATCH `{text}` for draft and `{text, submit:true}` for submit; Submit disabled for empty/whitespace text with no files and enabled with a file (REG-85); malformed save response surfaces an error (`/Couldn't save/` copy may change); attachments-unavailable explanation (`/attachments aren't available/i`).
- CHANGES: `findByLabelText("Your answer")` / `findByDisplayValue("first draft")` depend on the Input. A RichTextEditor (WebView/TenTap) won't expose these in jest, so the tests need a mock or an a11y label. "Start working" text goes away if auto-ensure is adopted.

`forum-screen.test.tsx` (292):
- KEEP: no PUT on open (C6); shared word count blocks a short post (no PUT); PUT `/api/v1/assignments/41/forum/response` with `{text}`; peers + "Group member"; Delete control from `canDelete` (label "Delete comment" kept by v1's aria-label); "Update response" when posted; POST comment to `/forum/posts/peer000001/comments`; "Show all comments" fetch; no comment block when `allowComments=false`; STANDARD does not fetch the forum.
- CHANGES: `"0 / 5 words"`, `"3 / 5 words"` → v1 `"0 words · minimum 5"`, `"3 words · minimum 5"`; `findByLabelText("Your response")` (Input label; v1 has a CardTitle plus the editor); `findByLabelText("Add a comment")` → v1 placeholder "Write a comment…" (add a matching a11y label); `getByText("Comment")` button → v1 icon button labelled "Post comment"; `"Due Apr 1, 2099"` (v1 shows no due date on forum); "Post to unlock the discussion" is the same title, but the description copy changes; leader feedback assertion (V2-ONLY, keep if the block is kept).

---------------------------------------------------------------------------
## 3. /student/profile → M/app/(app)/profile.tsx (StudentProfile only; Alumni/Account branches out of scope)

### a) v1
Files: `V1/app/student/profile/page.tsx` (139), `V1/components/students/avatar-upload.tsx` (82), `V1/components/students/student-form.tsx` (259), `stat-card.tsx` (76, spec in §1). Server-rendered; no loading UI. If there is no student profile it redirects to /student/dashboard.

- root `div.flex flex-col gap-3 md:gap-4`
  - identity hero `div.rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]` > `div.flex items-center gap-4`
    - `div.shrink-0` > AvatarUpload: `div.flex flex-col items-center gap-3`
      - `div.relative` > `Avatar size="xl"` (size-16; AvatarImage alt="Profile photo" if preview; `AvatarFallback` initials = first letters of name parts, else email[0], upper-case)
        - IF uploading: `div.absolute inset-0 flex items-center justify-center rounded-full bg-black/40` > `span.text-xs text-white` "Saving…"
      - `Button variant="outline" size="sm"` (disabled while pending) with `Camera` icon `size-4 mr-1.5` + preview ? "Change photo" : "Add photo"
      - hidden file input (jpeg/png/webp)
      - errors `p.text-xs text-error-500`: "Must be JPEG, PNG, or WebP" | "File must be under 5 MB" | server error | "Upload failed"
    - `div.min-w-0`
      - `p.truncate text-xl font-black text-brand-navy-900 dark:text-foreground` `{name ?? email}`
      - `p.truncate text-xs text-muted-foreground` `{email}`
      - `div.mt-2 flex flex-wrap gap-1.5` > `Badge variant="teal"` "Student"
  - IF engagement (i.e. there is an activeSeasonId): `div.grid grid-cols-3 gap-3`
    - StatCard label="Attendance" value=`{100 - budgetPct rounded, min 0}%` or "—" (shot "38%")
    - StatCard label="Assignments" value=`{submissionsCompleted}/{submissionsExpected}` (shot "1/4")
    - StatCard label="Streak" value= streak>0 ? `span.flex items-center gap-1` with `Flame className="size-6 text-warning-500"` and `{streak}` : `{streak}` (shot "0")
    - all white variant
  - form card `div.rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]`
    - `p.mb-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70` "Your details"
    - StudentForm mode="edit" isSelf: `form.flex flex-col gap-6`
      - Each Section = `fieldset.rounded-lg border border-border bg-card p-4 md:p-6` with `legend.px-1 text-sm font-semibold text-foreground` `{title}` (the legend sits on the top border, see shot), then `div.mt-2 flex flex-col gap-4`; inner grids `grid grid-cols-1 gap-4 md:grid-cols-2` (one column on phone)
      - "Personal": `FormField label="Full name" required` > `Input`; `FormField label="Date of birth"` > `DatePicker value onChange` (placeholder shown in shot: "Pick a date" + calendar icon)
      - "Contact": `FormField label="Email" required` > `Input type="email"`; `FormField label="Phone"` > `Input type="tel"`
      - "Academic": `FormField label="University"` > Input; `FormField label="Year / faculty"` > `Input placeholder="e.g. 3rd · Engineering"`
      - "Spiritual background": `FormField label="Notes"` > `Textarea rows={3} placeholder="Church affiliation, baptism status, faith journey…"`
      - "Community": `FormField label="Gifts / interests"` > `Textarea rows={2} placeholder="e.g. worship, hospitality, mentoring younger students"`
      - ("Admin only" section hidden for isSelf)
      - submitError `p.rounded-md bg-error-50 px-3 py-2 text-sm text-error-800`
      - `div.flex flex-col-reverse gap-2 sm:flex-row sm:justify-end` (phone: "Save changes" above "Cancel", full width)
        - `Button variant="outline"` "Cancel" → router.back()
        - `Button type="submit"`: pending "Saving…" | "Save changes"
      - client validation: name min 2 → "Name is required."; email → "Valid email required." (shown via FormField error); server fieldErrors are mapped onto fields. On success it pushes /student/profile (refresh) with no toast.
- md-only: `md:gap-4`, `md:p-6`, `md:grid-cols-2`, `sm:flex-row`.

### b) v2 today
- Hooks (keep): `useSessionStore` (role, `scopes.graduationYear`, `scopes.activeSeasonId`); `useMyProfile(true)` → key `queryKeys.me.profile()`; `useMyAttendance(activeSeasonId)` → key `queryKeys.me.attendance(seasonId)` (gives `budget`, `streak`); `useUpdateStudentProfile()` (PATCH `/api/v1/me/profile`, `setQueryData(me.profile)`); `useLogout` (account branch); `router.push("/settings")`. Validation through the shared `updateOwnProfileInputSchema.safeParse`; field errors map to Input `error`.
- Renders: IdentityCard (56px initials circle, name, email, label "Student"); stats only when `budget !== null`: "Absence budget left" `{remainingPct}%` and "Streak" `{streak}` (two cards, no Assignments); ProfileForm Card "Your details" with 6 Inputs (labels University / Year / Phone / "Date of birth (YYYY-MM-DD)" / Spiritual background / Gifts), message "Profile saved." or error, Button "Save profile"; then a Card "Name and email" / "Change your name in Settings. To change your email, contact the JPC team." / Button "Open settings". Loading/Error ("Couldn't load your profile.") and pull-to-refresh.
- Old-UI imports: `../../src/ui` (Button, Card, ErrorState, Input, LoadingState, Screen, Text), `../../src/theme`, `src/lib/initials` (initialsOf), `src/lib/api-error`.

### c) Data mapping (`MyProfile` S/student.ts:462; `MyAttendanceResponse` S/attendance.ts:102)
- Avatar image → GAP: `avatarPath` exists but there is no URL/read path, and uploads are disabled (ENABLE_UPLOADS=false, and there is no avatar upload endpoint in the backend). Render the fallback initials. The "Add photo" Button would be a dead control: render it disabled, or omit it (owner call). Recommendation: show it disabled to keep the layout.
- Initials → `initialsOf(name, email[0])` (exists).
- name/email/"Student" badge → `p.name`, `p.email`, static.
- Attendance stat → `attendance.budget.remainingPct` (= v1's `100 - budgetPct`, same number). Label CONFLICT: v1 "Attendance" vs v2's deliberate "Absence budget left" (spec 19 D14; tested). Owner call. Exact match means "Attendance". "—" when budget is null but engagement exists.
- Assignments stat `{completed}/{expected}` → GAP in mobile: no hook. Backend `GET /api/v1/students/{selfId}/engagement` returns `StudentSelfEngagement` (S/note.ts:165: submissionsCompleted, submissionsExpected) for a student asking about themselves, but `useStudentEngagement` parses the staff `studentEngagementSchema` and would fail. A new hook is needed (parse `studentSelfEngagementSchema`, user id from the session store). Alternative: compute from `useStudentAssignments` (submitted+reviewed / total), with a definition-drift risk.
- Streak (+Flame when >0) → `attendance.streak`.
- Stats visibility: v1 = has activeSeasonId; v2 = budget !== null. Use `activeSeasonId !== null` and render "—" for missing values.
- Form fields: university, year, phone, dateOfBirth (ISO "YYYY-MM-DD"), spiritualBackground, gifts → `MyProfile` / `updateOwnProfileInputSchema` (PATCH semantics). DatePicker gives a `Date` and needs a local-date ↔ "yyyy-MM-dd" conversion (date-fns `format`/`parse`; no TZ shift). The v1 DatePicker cannot clear a value; v2 allows "" ⇒ null (minor).
- Full name / Email fields → GAP/CONFLICT: `updateOwnProfileInputSchema` is `.strict()` and refuses name/email (spec 06). Name is editable via `useUpdateProfile` (use-me.ts, PATCH `/me` `{name}`); email is not editable anywhere in v2. Options: (a) show the Full name Input wired to `useUpdateProfile` alongside the profile PATCH (two mutations) and show Email read-only/disabled; or (b) keep v2's "Name and email" card (V2-ONLY). The test asserts no Name/Email inputs. Owner call.
- "Cancel" → `router.back()` (new; no v2 counterpart). "Save changes"/"Saving…" ↔ v2 "Save profile"; v2's success message "Profile saved." is V2-ONLY (v1 shows nothing). Error box ↔ `apiErrorMessage`.
- Labels change to v1's: "Year / faculty", "Notes" (under Spiritual background), "Gifts / interests", "Date of birth" (the DatePicker replaces the YYYY-MM-DD text field), "Phone", "University".
- V2-ONLY: Loading/Error states, pull-to-refresh, the "Name and email" settings card, alumni and account branches (out of scope).

### d) Components
- Ported: Avatar (size="xl" = size-16), Button (outline/sm, default), Badge teal, Input, Textarea, FormField (label/required/error), DatePicker (`value: Date|null`, `onChange(Date)`), Text.
- Needs port: `V1/components/students/stat-card.tsx` (76; shared with §1), `V1/components/students/avatar-upload.tsx` (82; display-only/disabled since uploads are off), `V1/components/students/student-form.tsx` (259; needs the `isSelf` path plus a Section/fieldset-legend look; RN has no fieldset, so the legend needs an absolute-positioned label over the border with a bg-card patch). The student form is probably also needed by staff student create/edit screens (other groups); coordinate with them.
- Icons: Camera, Flame.

### e) Tests: `profile-screen.test.tsx` (168), STUDENT block
- KEEP: name, "MA" initials, email shown; streak "3"; PATCH `/api/v1/me/profile` with the six fields only; shared-schema validation blocks an impossible date before sending (assertion uses `accessibilityHint` "Not a real calendar day." and the label "Date of birth (YYYY-MM-DD)", which change once it is a DatePicker; the impossible-date path becomes unreachable through a picker, so rework or drop this test); a response carrying `notes` is a failed save ("Couldn't save your profile."); no attendance query and no stats without an active season.
- CHANGES: "Absence budget left" → "Attendance" (if the owner agrees); "42%" stays; label lookups `getByLabelText("University")` stay, but "Year"/"Gifts" etc. change; "Save profile" → "Save changes"; "Profile saved." (V2-ONLY); `queryByLabelText("Name")/("Email")` null-assertions conflict with v1's Full name/Email fields; "Open settings" (V2-ONLY card) goes away if the card is dropped. A new Assignments stat needs a GET mock (`/api/v1/students/{id}/engagement`).
- ALUMNI and MENTOR blocks: out of scope; keep them passing (they share IdentityCard; if IdentityCard is restyled, "MM"/"MENTOR" assertions may be affected).
