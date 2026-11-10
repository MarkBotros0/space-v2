# People lists, sign-in and emails (owner, 2026-11-07)

> Owner ruling, moved verbatim from the root `CLAUDE.md` (2026-11-10). Backend paths are under
> `apps/backend/src/`, mobile paths under `apps/mobile/src/`, unless written in full.

- **Super's Community tab** (`/community`, replacing the Students tab and the Users page) lists
  every account (owner 2026-11-08: a row's Invite / Resend is a pill beside it, the status chip under its
  meta line). Search and a filter icon (`FilterButton`) share one row; the sheet narrows by role
  and by account status. Its header button is **New member** (`/users/new`). "Add students in bulk"
  opens the importer, which takes plain `name, email` lines with no header row.
- **Students list.** Filter is the icon in the search row, never a chip under it. A Super filters
  by season first, then that season's groups. Alumni and Dropped are a Show choice in the sheet
  (`/students?show=alumni`), not pages. Every row names the active season, else "Last season: …"
  (`lastSeasonTitle`).
- **A student's page (staff):** Edit is a pencil beside the name; sections switch on a segmented
  control; an empty Details card is left out.
- **Sign-in:** no boxed card; Forgot password under its field; "or", then Continue with Google
  (not wired yet: it says so); the invite code is a full-width row of its own.
- **Inviting and re-inviting** (owner, 2026-11-07). A season's admin may add someone with no account
  into that season (`POST /students` with their `seasonId`, a draft or running one; the season's Add
  people screen has Invite new, `/seasons/[code]/invite`); only a Super creates someone with no season.
  A Super, or an admin of a season the student is live in, resends a stuck invite from the student's
  page (`POST /students/:id/invite`, sharing `answerResend` with `POST /users/:id/invite`); the staff
  detail carries `invite` (null once the account is set up).
- **Finished seasons stay finished** (owner, 2026-11-07): never reopened, and they take no late
  submissions.
- **Emails** (`src/lib/email-templates.ts`) are drawn dark with the app's tokens, the logo and the
  stores' official badges as inline cid images (`email-assets.ts`; Gmail shows no SVG or data
  URLs). The store row shows only once `APP_STORE_URL` / `PLAY_STORE_URL` are set. An email can't
  copy to the clipboard: a code selects in one tap instead.
