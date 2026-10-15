# Inventory A — auth, check-in, More, Settings, Notifications

V1 root = `/home/mark/projects/JPC/.v1-reference/app/src`. V2 root = `/home/mark/projects/JPC/space-v2/apps/mobile`.
Ported components referenced as `@design/ui/<x>` = `src/design/ui/<x>.tsx` (all exported from `src/design/ui/index.ts`), `@design/layout/<x>` = `src/design/layout/<x>.tsx`.

Notes that apply to every screen:
- No v2 screen uses `ShellFrame` yet (`src/design/layout/shell-frame.tsx`: `ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 pb-24 pt-4"`). All (app) screens in this group still use old `Screen` from `src/ui`. The (app) layout already renders `AppTopBar` + `FloatingTabBar`.
- `PageHeader` (`@design/layout/page-header`) already gives v1's phone header: `flex-col gap-1 pb-4` > title `text-2xl font-semibold tracking-tight text-foreground` (accessibilityRole header) + description `text-sm text-muted-foreground`.
- Every v1 `md:` class is dropped at 375px: `md:p-8`, `md:p-6`, `md:gap-6`, `md:px-6 md:py-4`.
- Test-risk across the board: current tests find inputs with `getByLabelText("Email")` etc. The old `src/ui` `Input`/`FormField` set `accessibilityLabel` from `label`. The ported `@design/ui/input` does NOT take a label. The ported `FormField` renders `Label`, but it does not wire the label to the control. When rebuilding, pass `accessibilityLabel="<label>"` on each Input/PasswordInput, or these behaviour tests break. Field errors reach the control as `accessibilityHint` through the ported FormField (cloneElement), which matches the old tests' `props.accessibilityHint` assertions. Keep that.

---

## 1. /login

### a) v1
Files: `app/login/page.tsx` (41), `app/login/login-form.tsx` (57), `app/login/actions.ts` (46). Screenshot: `shots/public/{light,dark}/login.png`.
- Page: server redirect if already signed in (to callbackUrl or the role dashboard).
- `main` `flex min-h-dvh items-center justify-center px-4 py-12`
  - card `div` `w-full max-w-sm rounded-2xl border border-border/60 bg-card/90 p-6 shadow-[var(--shadow-pop)] backdrop-blur-md md:p-8`
    - `div` `mb-6 flex flex-col items-center gap-3 text-center`
      - `<Logo size="lg" />` (64px mark, no wordmark in the shot)
      - `div` `flex flex-col gap-1`
        - h1 `text-2xl font-semibold tracking-tight text-foreground`: "Welcome back"
        - p `text-sm text-muted-foreground`: "Sign in to JPC Space to continue."
    - `<LoginForm>`: `form` `flex flex-col gap-4`
      - (hidden callbackUrl input if present)
      - `label` `flex flex-col gap-1.5 text-sm`
        - span `font-medium text-foreground`: "Email"
        - `<Input name="email" type="email" required autoComplete="email" size="lg" />`
      - `label` `flex flex-col gap-1.5 text-sm`
        - span `font-medium text-foreground`: "Password"
        - `<PasswordInput name="password" required autoComplete="current-password" size="lg" />` (eye toggle)
      - error (only if state.error): p `rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-700 dark:border-error-900 dark:bg-error-950 dark:text-error-200`. Copy is either "Please enter a valid email and password." (zod fail) or "Invalid email or password." (auth fail).
      - `<Button type="submit" size="lg" disabled={pending} className="w-full">`: "Sign in", or "Signing in…" while pending
      - Link `/forgot-password` `text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline`: "Forgot password?"
- v1 shows no banner for `?reset=1`.

### b) v2 current: `app/login.tsx` (100)
- Keep: `useLogin()` (`src/hooks/use-session`), which does login → /me → setSession. Keep `useLocalSearchParams<{returnTo}>` + `returnHrefFor(returnTo) ?? "/dashboard"` → `router.replace`. Keep react-hook-form + `zodResolver(loginRequestSchema)` from `@space/shared`. Keep `AccessibilityInfo.announceForAccessibility(error)`, and keep the error with `accessibilityRole="alert"` + `accessibilityLiveRegion="assertive"`.
- Renders today: heading "JPC Space", error text "Incorrect email or password.", FormField Email / Password(secureTextEntry), Button "Sign in" (loading), ghost "I have an invite code" → `/accept-invite`, ghost "Forgot password?" → `/forgot-password`.
- Old-UI imports: `useTheme` from `src/theme`; `Button, FormField, Screen, Text` from `src/ui`.

### c) Data mapping
- Logo, title, subtitle: static. Email/password: RHF fields. Error box ← local `error` state. Pending label ← `formState.isSubmitting`.
- Copy differences:
  - v1 auth error is "Invalid email or password."; v2 is "Incorrect email or password.". Use v1's copy and update the test.
  - v1's validation copy "Please enter a valid email and password." is replaced in v2 by RHF per-field zod messages. Either show v1's single message when RHF validation fails, or keep the per-field errors. Decide.
- GAP: none (no server data).
- V2-ONLY:
  - "I have an invite code" → `/accept-invite`. It has no v1 counterpart, and it is tested (`login-screen.test.tsx` "links to the accept-invite screen"). Keep it in a v1 style (another muted text link under "Forgot password?").
  - `returnTo` deep-link return (R56).
  - Screen-reader announcement of the error.

### d) Components
- Covered by ported parts: `Logo` (size lg), `Input` (size lg), `PasswordInput` (size lg), `Button` (size lg, `className="w-full"`), `Text`.
- Card shadow: `shadowStyle("pop")` from `src/design/lib/shadow`.
- `backdrop-blur-md` and `bg-card/90` → use `bg-card/90`; no blur.
- `label > span` → `Label`, or Text `text-sm font-medium text-foreground` in a `flex-col gap-1.5` View.
- Nothing to port.

### e) Tests: `src/__tests__/login-screen.test.tsx` (94)
- Keep (behaviour):
  - success → replace("/dashboard") + login called with the values
  - failure keeps the field values and does not navigate
  - "I have an invite code" → push("/accept-invite")
  - returnTo check-in → replace({pathname:"/checkin/[token]",...})
  - a foreign returnTo is ignored
- Will change:
  - error copy "Incorrect email or password." → "Invalid email or password."
  - `getByLabelText("Email"/"Password")` needs accessibilityLabel on the new inputs

---

## 2. /forgot-password

### a) v1: `app/forgot-password/page.tsx` (55). Screenshot `shots/public/*/forgot-password.png`.
- `main` + card: same classes as login.
  - header block: same classes. `<Logo size="lg" />`, h1 "Forgot password", p "We'll email you a reset link. In development, look for the link in the server console." (source has `We&apos;ll`).
  - if `?sent`: p `mb-4 rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-700 dark:border-success-900 dark:bg-success-950 dark:text-success-200`: "If an account exists for that email, a reset link has been sent."
  - `form` `flex flex-col gap-4`
    - `label` `flex flex-col gap-1.5 text-sm` > span `font-medium text-foreground` "Email" + `<Input name="email" type="email" required size="lg" />`
    - `<Button type="submit" size="lg" className="w-full">`: "Send reset link"
- The form stays visible after sending (banner sits above it). There is no back link and no error state.

### b) v2 current: `app/forgot-password.tsx` (75)
- Keep:
  - `useForgotPassword()` (`src/hooks/use-password-reset`, POST `/api/v1/auth/forgot-password`, no query key)
  - local validation with `forgotPasswordRequestSchema` (sets the email error from the zod issue, e.g. "Must be a valid email.")
  - `apiErrorMessage(err, "Couldn't send the request. Check your connection and try again.")`
  - `PASSWORD_RESET_TTL_MINUTES`
- Renders today:
  - heading "Forgot password"
  - when sent: replaces the form with "If an account exists for that email, we've sent a reset code. It expires in ${TTL} minutes."
  - otherwise: intro "Enter your account's email and we'll send you a reset code.", failure text, Input Email, Button "Send reset code" (disabled when empty)
  - secondary "I have a reset code" → push("/reset-password")
  - ghost "Back to sign in" → replace("/login")
- Old-UI imports: `src/theme` useTheme; `Button, Input, Screen, Text` from `src/ui`.

### c) Mapping
- Success banner ← local `sent`. Error ← `failure` (V2-ONLY error box, error-box styling as on login).
- Copy conflict: v1 says "reset link" and mentions the server console. v2 says "reset code" because mobile users paste a code (Plan 10).
  - Exact v1 copy ("In development, look for the link in the server console.") is wrong for the app.
  - FLAG for the owner. Recommendation: v1 layout; title "Forgot password"; button v1-styled, label TBD ("Send reset link" vs "Send reset code"); the test asserts "Send reset code".
- V2-ONLY: TTL sentence; "I have a reset code"; "Back to sign in"; local email validation; error box; disabled-when-empty.
- GAP: none.

### d) Components
Same set as login (`Logo`, `Input` lg, `Button` lg w-full). Success box is a plain View + Text with the classes above. Nothing to port.

### e) Tests: `password-reset-screens.test.tsx` (127), ForgotPassword block
- Keep:
  - POST with the trimmed email
  - "I have a reset code" → push("/reset-password")
  - invalid email → accessibilityHint "Must be a valid email." and no POST
- Will change if copy changes:
  - button text "Send reset code"
  - the findByText confirmation sentence (lines 46–50)

---

## 3. /reset-password

### a) v1: `app/reset-password/page.tsx` (68). Screenshot `shots/public/*/reset-password.png`.
- `main` + card + header: same as login. h1 "Reset password", p "Choose a new password — at least 8 characters."
- if `?error`: error box (same classes as the login error) with the server message. Possible copy:
  - "Invalid token or password too short (min 8 chars)."
  - "Invalid or expired reset token."
  - "Reset token has already been used."
  - "Reset token has expired."
  - "Could not reset password."
- `form` `flex flex-col gap-4`: hidden token; `label` (same) > span "New password" + `<PasswordInput name="password" required minLength={8} size="lg" />`; `<Button type="submit" size="lg" className="w-full">` "Set new password"
- On success v1 redirects to `/login?reset=1` (no banner shown there). There is no success screen and no confirm field.

### b) v2 current: `app/reset-password.tsx` (137)
- Keep:
  - `useResetPassword()` (POST `/api/v1/auth/reset-password`)
  - `extractResetToken` + `passwordSchema` from `@space/shared`
  - consume the deep-link `token` param once, then `router.setParams({token: undefined})` (R80)
  - code-length check (<16 → "Paste the code from your email.")
  - confirm match "Passwords don't match."
  - `apiErrorMessage(err, "Couldn't reset your password. Check your connection and try again.")`
- Renders today:
  - form: heading "Reset password"; failure text + secondary "Request a new code" → replace("/forgot-password"); Input "Reset code"; Input "New password"; Input "Confirm password"; Button "Set new password" (disabled until all are filled); ghost "Back to sign in"
  - done state: "Password updated" / "Sign in with your new password. Every other device signed in to this account has been signed out." / Button "Go to sign in" → replace("/login")
- Old-UI imports: `src/theme`; `Button, Input, Screen, Text` from `src/ui`.

### c) Mapping
- v1 field "New password" ↔ v2 `password`. Error box ↔ `failure`.
- V2-ONLY:
  - "Reset code" field (v1 carried the token in the URL)
  - "Confirm password" field
  - done screen (v1 redirects to login)
  - "Request a new code"
  - "Back to sign in"
  - Recommendation: render the done state with the same card/header pattern (title "Password updated").
- GAP: none.

### d) Components
`Logo`, `PasswordInput` lg (replace secureTextEntry Inputs), `Input` lg for the code, `Button` lg. Nothing to port.

### e) Tests: `password-reset-screens.test.tsx`, ResetPassword block
- Keep:
  - deep-link token consumed + setParams once
  - pasted v1 link → POST {token,password} → "Go to sign in" → replace("/login")
  - "short" → accessibilityHint "At least 8 characters." and no POST
  - server refusal text shown + "Request a new code" → replace("/forgot-password")
- Will change: needs `accessibilityLabel`s "Reset code" / "New password" / "Confirm password" on the new inputs.

---

## 4. /checkin/[token]

### a) v1: `app/checkin/[token]/page.tsx` (77). Screenshot `shots/student/*/checkin__not-a-real-token.png` (error branch only). Standalone page, no shell.
- Anonymous → redirect `/login?callbackUrl=/checkin/<token>`.
- v1 checks the student in during render (side effect).
- Success:
  - `main` `flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center`
    - span `inline-flex size-16 items-center justify-center rounded-full bg-success-100 text-success-700 dark:bg-success-900 dark:text-success-200` > lucide `CheckCircle` `size-8`
    - h1 `text-2xl font-semibold text-foreground`: "You're checked in!" (PRESENT) or "Checked in — late" (LATE)
    - LATE only: p `text-muted-foreground`: "{n} minute{s} after session start."
    - Link → `/student/dashboard` `mt-2 text-sm text-brand-teal-600 underline-offset-4 hover:underline dark:text-brand-teal-400`: "Go to dashboard"
- Failure:
  - same `main`
    - span `inline-flex size-16 items-center justify-center rounded-full bg-error-100 text-error-700 dark:bg-error-900 dark:text-error-200` > `Clock` `size-8` if already_checked_in, else `XCircle` `size-8`
    - h1 (same classes): "Already checked in" or "Can't check in"
    - p `text-muted-foreground`, by code:
      - invalid_token: "This check-in link is not valid."
      - not_open: "Check-in hasn't been opened yet. Ask your leader to open it."
      - closed: "Check-in is now closed."
      - not_enrolled: "You are not enrolled in this season."
      - already_checked_in: "You already checked in (present|late|recorded)." (`currentStatus.toLowerCase()`)
    - Link "Go to dashboard" (same classes)

### b) v2 current: `app/checkin/[token].tsx` (62) + `src/components/check-in/CheckInResult.tsx` (19) + `src/lib/check-in-result.ts` (48)
- Keep:
  - `useSessionStore(s=>s.status)` → `<Redirect>` to `{pathname:"/login", params:{returnTo:"/checkin/<token>"}}`, or plain "/login" when the token is malformed
  - `parseCheckInCode(raw)`
  - `useCheckIn()` mutation (POST `/api/v1/sessions/check-in`; invalidates `queryKeys.sessions.all`, `queryKeys.me.all`; `DASHBOARD_META`)
  - `checkInRefusalCode(err)`, `checkInCopy(outcome)`
  - outcome state
  - NO write on open: the check-in happens on an explicit press (spec 04 D3/C6)
- Renders today:
  - title "Session check-in"
  - malformed token → "This check-in link is not valid."
  - pre-press: "Check in to the session this code belongs to?" + Button "Check in" (loading)
  - after press: `CheckInResult` (heading coloured success-700 / error-600, plus message)
  - secondary Button "Go to dashboard" → replace("/dashboard")
- Old-UI imports: `src/theme`; `Button, Screen, Text` from `src/ui`. CheckInResult uses `src/theme` + `src/ui` Text.

### c) Mapping
- Icon/title/message ← `checkInCopy(outcome)` (titles already v1-verbatim).
- Icon choice:
  - success → CheckCircle
  - refused `already_checked_in` → Clock
  - other refusals → XCircle
- Malformed-token branch: v1 render = error circle + XCircle + "Can't check in" + "This check-in link is not valid." (matches the screenshot). The v2 copy is the same, but it is shown as plain text under "Session check-in". Render it as the v1 error layout.
- Message differences in `checkInCopy`:
  - invalid_token is "This check-in code is not valid." (v1: "link")
  - already_checked_in is "You already checked in to this session." (v1 includes the status)
  - GAP: the v2 refusal error has no `currentStatus`, so v1's "(present)/(late)" can't be reproduced; the message stays generic.
  - default "Couldn't check you in. Check your connection and try again." is V2-ONLY.
- V2-ONLY:
  - pre-press confirm state (prompt + "Check in" button). Not in v1. Must be kept (tested, spec). Render it in the v1 layout, e.g. title + muted prompt + Button.
  - "Session check-in" title: no v1 equivalent. Drop it, or use it as the h1 of the confirm state.
- "Go to dashboard": v1 is a teal text link, v2 a secondary button → render as `Pressable`/`Text` `mt-2 text-sm text-brand-teal-600 dark:text-brand-teal-400`.

### d) Components
- No ported component covers the icon circle. Inline View `size-16 items-center justify-center rounded-full bg-success-100 dark:bg-success-900` + lucide-react-native `CheckCircle`/`Clock`/`XCircle` size 32 with `className="text-success-700 dark:text-success-200"`. Needs `iconWithClassName` (src/design/lib/icon).
- `CheckInResult.tsx` (19 lines, old UI): rewrite it, or inline its logic.
- Use `Button` for the "Check in" press.

### e) Tests
- `checkin-link-screen.test.tsx` (95): all behaviour, keep.
  - anon redirect carries returnTo
  - no POST on open
  - press → POST once → "You're checked in!"
  - refusal copy "You are not enrolled in this season."
  - malformed → "This check-in link is not valid." with no "Check in" text (careful: a v1-style "Can't check in" heading contains "check in" in lowercase; `queryByText("Check in")` is an exact match, so it is fine)
  - "Go to dashboard" → replace("/dashboard")
- `check-in-result.test.ts` (42): pure lib tests, keep. If the invalid_token / already_checked_in copy changes to v1's, update lines 35–40.

---

## 5. /student/more

### a) v1: `components/layout/more-menu.tsx` (151), used by `app/student/more/page.tsx`. Nav data: `lib/navigation.ts`. Screenshot `shots/student/*/student__more.png`.
- `div` `flex flex-col gap-6`
  - `<PageHeader title="More" description="Account, settings, and more places to go." />`
  - identity section `flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] md:p-6`
    - avatar `flex size-12 items-center justify-center rounded-full bg-muted text-base font-semibold text-foreground`: initials (first letter of the first two name parts, uppercased; no name → the role's first letter)
    - `div` `flex flex-1 flex-col gap-1`
      - name (if any) span `text-sm font-semibold text-foreground`
      - `<Badge role={roleColor} className="w-fit">{user.role}</Badge>` ("STUDENT", orange)
  - items (sidebar minus tabs), if any: section `overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]` > ul `divide-y divide-border` > li > Link `flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent md:px-6 md:py-4`
    - icon box `flex size-9 items-center justify-center rounded-lg bg-muted text-foreground` > Icon `size-4`
    - label span `flex-1 truncate`
    - `ChevronRight` `size-4 text-muted-foreground`
    - Student items (v1): Current Season (Sparkles), History (FileText), Profile (User), Settings (Settings).
  - appearance section `flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] md:p-6`
    - `div flex flex-col gap-0.5`: "Appearance" (`text-sm font-medium text-foreground`), "Switch between light and dark." (`text-xs text-muted-foreground`)
    - `<ThemeToggle size="icon" />`
  - sign-out button `flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm font-medium text-error-700 shadow-[var(--shadow-soft)] transition-colors hover:bg-error-50 dark:text-error-200 dark:hover:bg-error-950 md:p-6` > `LogOut size-4` + "Sign out"
- The role only changes the item list and the badge colour.

### b) v2 current: `app/(app)/more.tsx` (90)
- Keep:
  - `useSessionStore(s=>s.user)`, `useSessionStore(s=>s.nav())`
  - `moreItemsFor(nav)` and `navHref(item.href)` (`src/lib/nav-routes`) → `router.push(target)`
  - `useLogout()` → `void logout()`
  - `initialsOf` (src/lib/initials; the ported component uses its own `initialsFor`)
- Renders: old-style title/description, Card with an initials circle + name + role caption, a Card of rows (NavIcon + label, no chevron), secondary Button "Sign out". No Appearance row.
- Old-UI imports: `NavIcon` from `src/components/NavIcon`; `useTheme` from `src/theme`; `Button, Card, Screen, Text` from `src/ui`.

### c) Mapping
- name ← `user.name`. role ← `user.role`. items ← `nav` (shared `navFor`). Theme ← ported `ThemeToggle` (uses `src/design/theme/theme-mode`).
- V2-ONLY: student More also lists "Attendance" (CheckCheck) and "Notifications" (Bell). In v1 these are reached from the dashboard tile and the top-bar bell. They come from `packages/shared/src/navigation.ts` (spec 04 D14), and `more-screen.test.tsx` asserts "Attendance". Expected order: Current Season, Attendance, History, Profile, Notifications, Settings. Mentor/alumni also get "Notifications". FLAG: keep (spec) vs hide (pixel match).
- GAP: none (name, role and nav all exist).

### d) Components
- ALREADY PORTED: `src/design/layout/more-menu.tsx` (`MoreMenu({role, userName, nav, onNavigate, onSignOut})`) is a full port with v1 classes, icons, Appearance + ThemeToggle, and the error sign-out. It is not used yet. `more.tsx` becomes: wrap in ShellFrame, then `<MoreMenu role={user.role} userName={user.name} nav={nav} onNavigate={(h)=>{const t=navHref(h); if(t) router.push(t)}} onSignOut={()=>void logout()} />`.
- Covered by `more-menu.test.tsx` (33).
- Nothing else to port. `src/components/NavIcon` becomes unused here.

### e) Tests
- `more-screen.test.tsx` (81), all behaviour, keep:
  - the student label list
  - tabs are not duplicated
  - initials "MA" / name / "STUDENT"
  - admin vs alumni sets
  - press "History" → push("/history")
  - "Sign out" → logout once
- Possible break: the ported row uses `accessibilityRole="link"`, which is fine for getByText.
- `more-menu.test.tsx`: already targets the ported component, keep.

---

## 6. /student/settings

### a) v1: `app/(settings)/settings-page.tsx` (46), `components/settings/settings-form.tsx` (211), actions `lib/settings-actions.ts`. Screenshot `shots/student/*/student__settings.png`.
- `<PageHeader title="Settings" description="Profile, password, and notification preferences." />`
- `SettingsForm`: `div` `flex flex-col gap-4 md:gap-6`
- Local `Section` component, used three times:
  - section `rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] md:p-6`
  - header `div mb-4 flex items-start gap-3`
    - icon box `flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-teal-100 text-brand-teal-700 dark:bg-brand-teal-950 dark:text-brand-teal-300` > Icon `size-4`
    - `div min-w-0`: h2 `text-base font-semibold text-foreground` + p `text-xs text-muted-foreground`
- 1) Section icon `UserRound`, title "Profile", description "Your name as it appears across JPC Space."
  - form `flex flex-col gap-4`
    - `<FormField label="Name" required>` (red " *") > `<Input value={name}>` (default size)
    - `<FormField label="Email" description="Change via the admin console.">` > `<Input value={email} disabled />`
    - `div flex justify-end` > `<Button type="submit" disabled={pending || name.trim()===initialName.trim()}>`: "Save profile" / "Saving…"
  - toasts: success "Profile saved."; error = the server error (zod fail "Please fix the highlighted fields.")
- 2) Section `Lock`, "Change password", "Use at least 8 characters."
  - form `flex flex-col gap-4`
    - `FormField label="Current password" required error={pwFieldErrors.currentPassword}` > `PasswordInput autoComplete="current-password"`
    - `FormField label="New password" required error={...newPassword}` > `PasswordInput`
    - `FormField label="Confirm new password" required error={...confirm}` > `PasswordInput`
    - `div flex justify-end` > `Button disabled={pending || !current || !next || !confirm}`: "Update password" / "Updating…"
  - toasts:
    - success "Password updated." (clears the fields)
    - error: "Current password is incorrect." (field: "Incorrect."), "No password set on this account.", or "Please fix the highlighted fields."
    - field messages: "Current password required.", "At least 8 characters.", "Confirm your new password.", "Passwords don't match."
- 3) Section `Bell`, "Notifications", "Changes save automatically."
  - ul `flex flex-col divide-y divide-border`
  - li `flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0`
    - `div min-w-0`: span `block text-sm font-medium text-foreground` label + span `block text-xs text-muted-foreground` description
    - `<Switch aria-label={label} checked onCheckedChange className={pending && "opacity-70"} />`
  - rows (label / description):
    - "New assignments" / "When an admin creates an assignment you're targeted by."
    - "Submission reviewed" / "When a leader leaves feedback on your submission."
    - "Session rescheduled" / "When a session you're enrolled in moves time."
    - "Low-attendance flags" / "When a student you lead/admin misses 3 in a row."
    - "Mentor follow-ups" / "When a mentor flags a note for admin follow-up."
  - optimistic toggle, reverts + `toast.error` on failure
- No role differences (same page for all six roles). The Change password section always shows in v1.

### b) v2 current: `app/(app)/settings.tsx` (206) + `src/components/NotificationPreferences.tsx` (141)
- Keep (settings.tsx):
  - `useUpdateProfile()` (PATCH `/api/v1/me`, reconciles the store)
  - `useChangePassword()` (POST `/api/v1/me/password`, returns `sessionsRevoked`)
  - `useLogoutAll()` (POST `/api/v1/auth/logout-all`) → `clearSession()` + store `clear()` + replace("/login")
  - `useLogout()` → replace("/login")
  - `useSessionStore` user/clear
  - name 2–120 validation ("Between 2 and 120 characters.") and Save disabled until changed+valid (REG-80)
  - `passwordSchema` client check, confirm mismatch "Passwords don't match." client-side only
  - section hidden when `!user.hasPassword`
- Keep (NotificationPreferences):
  - `useNotificationPreferences()` (key `queryKeys.notifications.preferences()`, GET `/api/v1/me/notification-preferences`)
  - `useUpdateNotificationPreferences()` (PUT all six keys, optimistic + rollback in the hook)
  - `enablePush()` (`src/lib/push`) + `useSessionStore(s=>s.pushToken)`
  - `PUSH_COPY` states
  - loading/error states
- Renders today:
  - Card "Profile": Input Name; label "Sign-in email" + email text + "Ask an administrator to change your email."; "Saved."; Button "Save name"
  - Card "Change password": inputs; revoked message "Signed out of N other device(s)."; Button "Update password"
  - `<NotificationPreferences/>`:
    - heading "Notifications"
    - explainer "Turning one off stops the emails and push for that kind of notification. They will still appear in your inbox — that is your history."
    - six rows, RN `Switch`, ORDER: assignmentCreated, submissionReviewed, sessionRescheduled, quizGraded, lowAttendanceFlag, mentorFollowup
    - labels: "Assignment created", "Submission reviewed", "Session rescheduled", "Low attendance flag", "Mentor follow-up", "Quiz graded"
    - help texts differ from v1 (low attendance: "...misses two consecutive sessions.")
    - push block: "Push notifications" + status copy + Button "Enable push notifications" / "Push enabled on this device"
  - Card "Security": Button "Sign out", ghost "Sign out everywhere", "Signs this account out on every device — use it if a phone is lost."
- Old-UI imports:
  - settings.tsx: `src/theme`; `Button, Card, Input, Screen, Text` from `src/ui`; `src/components/NotificationPreferences`
  - NotificationPreferences: `src/theme`; `Button, Card, ErrorState, LoadingState, Text` from `src/ui`; RN `Switch`

### c) Mapping
- Name ← local state seeded from `user.name`. Email ← `user.email` (v1 shows it as a disabled Input with description "Change via the admin console.").
- Save disabled: v1 = unchanged only; v2 adds validity. Keep v2's.
- Feedback channel: v1 uses toasts. Use the ported `toast` (`@design/ui/toaster`; `<Toaster/>` is mounted in app/_layout) for:
  - "Profile saved."
  - "Password updated."
  - errors
  - Replaces the v2 inline "Saved." and the inline error texts. Keep the field errors under the fields.
- Password field errors ← the client check (`passwordSchema` → "At least 8 characters."; mismatch → "Passwords don't match." on confirm). Server error: v2 says "Couldn't change the password. Check your current password." vs v1's toast "Current password is incorrect." + field "Incorrect.". Choose v1 copy only if the API error code allows it.
- Pending labels "Saving…" / "Updating…" ← `updateProfile.isPending` / `changePassword.isPending`. v1 shares one `pending` across all three sections; v2 has them per mutation.
- Prefs: rows ← `useNotificationPreferences().data[key]`. Switch `opacity-70` while `update.isPending`.
- V2-ONLY:
  - `hasPassword` hide
  - `sessionsRevoked` message ("Signed out of N other devices.", tested). Could go into the success toast.
  - sixth pref `quizGraded` (no v1 row; needs label + description in v1 voice, e.g. "Quiz graded" / "When a quiz you took has been graded.")
  - push block
  - Security card (Sign out / Sign out everywhere, tested)
  - loading/error states for prefs
  - explainer paragraph (v1 section description is "Changes save automatically.")
- Copy conflict:
  - v1 low-attendance description says "3 in a row"; v2 deliberately says two (spec D12, tested `/two consecutive/i`). FLAG: keep "two".
  - v1 labels: "New assignments", "Low-attendance flags", "Mentor follow-ups". v2 labels: "Assignment created", "Low attendance flag", "Mentor follow-up". These are tested by accessibilityLabel in `notification-preferences.test.tsx`.
- GAP: none for data. Note `user.name` is `string` (always present).

### d) Components
- Covered by ported parts: `FormField` (label, required asterisk, description, error), `Input`, `PasswordInput`, `Button`, `Switch` (`checked`/`onCheckedChange`/`accessibilityLabel`), `toast`, `PageHeader`, `ShellFrame`, `Skeleton` (could replace the old LoadingState).
- Needs porting: v1's local `Section` helper inside `components/settings/settings-form.tsx` (~25 lines, lines 55–80). Create it for v2 (e.g. `src/design/settings/section.tsx` or inline). Lucide icons: `UserRound`, `Lock`, `Bell`.
- The whole of `settings-form.tsx` (211 lines) is the screen body. `NotificationPreferences.tsx` should be rebuilt in Section style (old UI).
- Divider: `divide-y` → `border-t border-border` on i>0 (as more-menu does); `first:pt-0 last:pb-0` → pt-0 on the first row, pb-0 on the last.

### e) Tests
- `settings-screen.test.tsx` (167). Behaviour, keep:
  - "hides the password section (hasPassword false)"
  - "saves the profile name … reconciles the store"
  - "keeps Save disabled until changed and valid" (keep the logic; the button label changes)
  - "changes the password … refresh token" + "Signed out of 2 other devices."
  - "mismatch check client-side" (accessibilityHint on "Confirm new password")
  - "logs out everywhere"
- Markup/copy that will change:
  - `getByText("Save name")` / `getByRole("button",{name:"Save name"})` → "Save profile"
  - `getByText("sp@jpc.test")`: the email is now an Input value → use `getByDisplayValue`
  - "Security" heading assertion (only if the Security card is restyled/renamed)
- `notification-preferences.test.tsx` (95). Behaviour, keep:
  - six switches present
  - PUT all six keys
  - optimistic flip
  - rollback
- Will change:
  - `fireEvent(…, "valueChange", false)` and `props.value`: the ported Switch is a Pressable with `onCheckedChange` + `accessibilityState.checked` → use `fireEvent.press` and `accessibilityState.checked`
  - labels if they switch to v1 copy
  - `/still appear in your inbox/i` if the explainer is dropped
  - `/two consecutive/i`: keep per spec

---

## 7. /student/notifications

### a) v1: `app/(notifications)/notifications-page.tsx` (89). Screenshot `shots/student/*/student__notifications.png`.
- Server fetch: take 100, newest first.
- `<PageHeader title="Notifications" description={`${unread} unread of ${total}`} />`, e.g. "2 unread of 4"
- Empty: `<EmptyState icon={BellOff} title="No notifications" description="Activity that involves you will appear here." />`
- List: ul `flex flex-col gap-2` > li
  - wrapped in `Link href={n.link} className="block"` if a link exists
  - `<Card>` > `<CardContent className={`flex items-start gap-3 pt-4 ${!n.readAt ? "border-l-4 border-info-500" : ""}`}>`
    - `Bell` `mt-0.5 size-4 shrink-0 text-muted-foreground`
    - `div flex flex-1 flex-col gap-1`
      - `div flex flex-wrap items-center gap-2`
        - span `text-sm font-medium`: title
        - `<Badge variant="outline" className="text-[10px]">` `{type.replace(/_/g," ")}` (e.g. "QUIZ GRADED")
        - unread only: `<Badge variant="info" className="text-[10px]">New</Badge>`
      - body (if any): p `text-sm text-muted-foreground`
      - p `text-xs text-muted-foreground`: `format(createdAt,"MMM d, yyyy · h:mm a") · formatDistanceToNow(addSuffix)`
        - The v1 source has a mojibake separator ("آ·", bytes D8 A2 C2 B7), so production shows "Jul 8, 2026 1:57 آ· PM 3 آ· months ago".
        - The intent is "Jul 8, 2026 · 1:57 PM · 3 months ago". Use "·". The "h:mm a" got split by the mojibake ("1:57 آ· PM"), so the intended format is "MMM d, yyyy · h:mm a".
- No mark-read control, no read-on-open, no loading/error UI (server rendered). Same page for all roles.

### b) v2 current: `app/(app)/notifications.tsx` (123)
- Keep:
  - `useNotifications()` (infinite; key `queryKeys.notifications.list(false)`; GET `/api/v1/notifications?limit=20[&cursor]`)
  - `flattenNotifications(data.pages)`
  - `useMarkRead()` (POST `/api/v1/notifications/read`; invalidates `notifications.lists()` + `unreadCount()`)
  - tap: if unread, `markRead.mutate({ids:[id]})`; then `routeForTarget(item.target)` → `router.push`
  - "Mark all read" → `markRead.mutate({all:true})`
  - FlatList `onEndReached` → `fetchNextPage` when `hasNextPage`; pull-to-refresh `refetch`/`isRefetching`
  - LoadingState / ErrorState("Couldn't load your notifications.", retry)
  - no write on render (C6)
- Renders today:
  - secondary Button "Mark all read"
  - EmptyState "No notifications" / "You're all caught up."
  - Card per row: heading title, body, label `formatDate(createdAt)` + " · Unread", left border 3px navy when unread
- Old-UI imports: `src/theme`; `Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text` from `src/ui`; `formatDate` from `src/lib/format`.

### c) Mapping
- title ← `item.title`. body ← `item.body`. type badge ← `item.type.replace(/_/g," ")` (`notificationTypeSchema` incl. QUIZ_GRADED). New badge ← `item.readAt === null`. Unread border ← same. createdAt ← `item.createdAt` (ISO string; format with date-fns, which is already used elsewhere?, or `src/lib/format`). Navigation ← `item.target` via `routeForTarget` (not `link`).
- Header "X unread of Y":
  - unread ← `data.pages[0].unreadCount` (a real count, better than v1)
  - GAP: total count. The API returns no total, only a cursor page (20/page). Options: add `totalCount` to `notificationListResponseSchema` + backend, or show the loaded `items.length` (wrong past page 1).
- V2-ONLY:
  - "Mark all read" button (tested): place it in `PageHeader actions` as `Button variant="outline" size="sm"`?
  - mark-read on tap
  - infinite paging + pull-to-refresh
  - loading/error states
  - whole card pressable even without a target (v1 only linked when `link` existed; v2 marks read even without a target, tested)
- Empty copy: v1 "Activity that involves you will appear here." vs v2 "You're all caught up." → use v1 (test asserts only the title).

### d) Components
- Covered by ported parts: `PageHeader` (with actions), `Card` + `CardContent` (`@design/ui/card`; CardContent base `p-4 pt-0` + `pt-4` override → p-4), `Badge` variant outline / info + `textClassName="text-[10px]"`, `EmptyState` (icon `BellOff`), `Skeleton` for loading, `Button`.
- Card left border: `border-l-4 border-info-500` on CardContent (v1 puts it on the content; the screenshot shows a blue bar at the card's left edge).
- Lists: FlatList needs the frame's padding → use `ShellFrame scroll={false}` + FlatList, or the FlatList `contentContainerClassName="px-4 pb-24 pt-4"` with PageHeader as `ListHeaderComponent`. Item gap 2 (8px).
- No v1 non-ui component to port. Lucide `Bell`, `BellOff`.

### e) Tests: `notifications-screen.test.tsx` (149)
- All behaviour, keep:
  - lists rows + GET `?limit=20`
  - no POST on read
  - tap marks one read and pushes route
  - an already-read row is not re-marked
  - "Mark all read" posts `{all:true}`
  - empty → "No notifications"
  - no target → marks read but no push
- Watch:
  - row press is found by title text; keep the Pressable wrapping the Card
  - "Mark all read" text must remain
- No old-markup assertions (" · Unread" isn't asserted).
