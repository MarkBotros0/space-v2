---
name: ui-sweep
description: Use after building or substantially changing any JPC Space v2 mobile screen — a new route, sheet, dialog, form, list, tab or step in a flow — before calling it done, to screenshot every state of it across a 360×640 phone and the 375dp reference phone, font 1.0/1.3, 3-button/gesture navigation and light/dark, and check it against the layout checklist. Trigger on "UI sweep", "ui-sweep", "check the UI", "sweep the new screen", "does it fit on small phones", "check font scale / keyboard / nav bar / dark mode", or when finishing a mobile UI batch even if the user didn't ask for a sweep. Not the v1 side-by-side (that is capture-v2.sh + batch-N-pairs.sh), and not for backend-only work.
---

# UI sweep for a v2 mobile screen

A screen is "done" once its side-by-side capture against v1 matches — but that capture is one 375dp
phone at font 1.0, and v1 is a web page. It never had a keyboard covering a form, an Android nav bar
under the floating tab bar, a 360dp-wide phone at font 1.3, or a dark system theme on first launch.
Jest checks the accessibility tree, where clipped or covered text still counts as present. The sweep
is the check for everything the v1 match can't see: it screenshots every state of a screen across a
16-cell device matrix so someone can *look* at it.

The harness exists. Read these before starting:
- `tools/ui-reference/README.md` → **"UI sweep"** (runner, matrix, flags, output) and **"v2 capture
  rig"** (emulator, Metro, backend, reference users).
- `CLAUDE.md` → **"Mobile conventions"** → "UI matches v1 exactly", and **"Rules from the UI sweep"**
  once it has entries. The checklist in step 4 is the starting point; rules learned from findings
  are added there.

## 1. List what the screen puts on screen

Before touching a flow, write down every state a user can see, for each role that reaches it
(`navFor(user)` decides — a student and a leader often land on the same route file):
- loading, empty, filled and error states (`LoadingState`, `EmptyState`, `ErrorState`/`RouteError`);
- each step of a multi-step flow and where it lands afterwards;
- with the keyboard open, for every input: the focused field *and* its submit button;
- scrolled to the end, for anything taller than 360×640 — the last item must clear the floating
  pill tab bar and the system bar;
- sheets, dialogs, menus (user menu, notification bell), open, with their keyboard if they have inputs;
- where it shows up elsewhere: dashboard cards, the More list, notifications, badges.

A state you don't screenshot doesn't get checked. States the shared database can't produce for the
reference users (an empty list when theirs is full) can't be swept — list them in the report.

## 2. Cover those states with a sweep flow

Flows live in `apps/mobile/.maestro/sweep/`. If an existing `sNN-*.yaml` already passes through the
screen, add `takeScreenshot` steps there; otherwise add `sNN-<screen>.yaml` with the next free number.
Copy a neighbour: `s01-signed-out.yaml` for signed-out screens, `s02-settings.yaml` for signed-in
ones (`runFlow: _sign-in.yaml` with `EMAIL: ${<ROLE>_EMAIL}`, then `openLink: spacev2://<route>`).
The runner passes `STUDENT_EMAIL`, `ALUMNI_EMAIL`, `LEADER_EMAIL`, `ADMIN_EMAIL`, `SUPER_EMAIL`,
`MENTOR_EMAIL` (from `.v1-reference/users.json`), `PASSWORD`, and `THEME` (`light`/`dark`).

**Never save anything.** The backend runs against the test database v1 shares, and the reference
users are real accounts. A sweep flow opens forms, types, screenshots and leaves — it never taps
Save, Submit, Delete, Check in, Mark attendance or anything else that writes. A state only reachable
by writing (a success screen, the row after "Add") stays out of the sweep; say so in the report.

Authoring rules:
- **Name shots bare:** `- takeScreenshot: sNN-MM-<state>`, keyboard shots ending `-kbd`. Maestro 2.11
  only writes under its own output folder; the runner collects files starting with `sNN-`.
- **`waitForAnimationToEnd` before every shot,** keyboard shots especially, or the shot catches a
  half-open keyboard and the next `hideKeyboard` runs before it arrives.
- **Never tap by screen position.** A percentage lands somewhere different in each cell. Use text, an
  `accessibilityLabel` (Input fields are labelled by their `label`) or a `testID`.
- **Anything possibly below the fold:** `runFlow: { file: _tap.yaml, env: { TARGET: '…' } }` (or
  `_tap-id.yaml` with `TARGET_ID`), which scrolls it to the centre first. Maestro never scrolls before
  a tap and counts an element behind the floating tab bar as visible, so a plain `tapOn` hits the bar.
- **Text is a regex:** escape `?`, `(`, `)`, `+`, `.` in `TARGET` and `visible:` (`'Forgot password\?'`).
- **Wait on something that stays put** — a page description, the `User menu` button — not a heading
  that scrolls away at 1.3.
- If the flow has to step around an app bug to reach the next state, do it **and leave a comment
  saying it is a finding**. The bug still goes in the report.
- Run `~/.maestro/bin/maestro check-syntax <flow>` on every flow you touch.

## 3. Run it

Bring the lab up as `tools/ui-reference/README.md` says. The pieces are JPC-only, but other chats on
this devbox use them for v1 captures: check first (`tmux ls | grep jpc-space`,
`pgrep -fa "ui-sweep.mjs|capture-v2|maestro"`) and don't start a run while another is driving
emulator-5558.
- `./emulator.sh` — AVD `jpc-ui` on emulator-5558 (never 5554/5556, never `expo run:android`);
- Metro on **8095**: `cd apps/mobile && EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4100 npx expo start --dev-client --port 8095` in tmux;
- signed-in flows also need `./backend.sh` (:4100) and `node set-reference-passwords.mjs`, which
  **changes six users' passwords on the shared test database** — ask the user before running it, and
  run `node restore-reference-passwords.mjs` when the sweep is done. The runner refuses signed-in
  flows until the passwords are set.

Start with the worst cell and the reference phone in the other theme. That catches most problems:

```bash
mkdir -p ~/logs; tmux kill-session -t space-v2-ui-sweep-run 2>/dev/null
tmux new -d -s space-v2-ui-sweep-run "cd /home/mark/projects/JPC/space-v2/tools/ui-reference && \
  node ui-sweep.mjs --cells=small-1.3-3btn-light,iphone-1.0-gesture-dark --flows=sNN \
  2>&1 | tee ~/logs/space-v2-ui-sweep-run.log"
```

Tell the user the session name and log path. Before the batch is called done, run its flows across
all 16 cells (drop `--cells`). `--cells` and `--flows` take prefixes (`--cells=small-1.3` is four
cells); `--into=<run folder>` re-runs failed pairs into an existing contact sheet. The log blanks the
password; never print it or `.secrets/` yourself.

**A failed flow** leaves `<cell>/sNN-zz-FAILED.png`. Read it before changing anything.
- If the flow is wrong (a stale selector, a missing scroll, an unescaped `?`), fix the flow.
- If the app is wrong, it's a finding. Get the flow past it (step 2) and record it.
- Re-run until every pair completes.

**Device state:** the runner changes size, density, font scale, nav mode and night mode, saves the
originals to `~/projects/JPC/.v2-captures/ui-sweep/.device-before.json` and puts them back at the end,
also on Ctrl+C. If the emulator dies mid-run, the next run refuses to start; run
`node ui-sweep.mjs --restore` once the emulator is back. Don't delete the file to get past it.

## 4. Review every screenshot

Output goes to `~/projects/JPC/.v2-captures/ui-sweep/<timestamp>/`: one folder per cell, `results.json`
and `index.html` (one row per state, one column per cell). **Compare each state across cells** — most
bugs show in one or two of the sixteen. Check every shot for:

- anything the user needs under the system nav bar or gesture handle, the floating pill tab bar, a
  sticky save bar, or the status bar; the last item of a scroll view that can't be scrolled clear;
- with the keyboard open, the focused field or its submit button hidden, or a band of padding left
  behind once the keyboard closes;
- sheets, dialogs and menus taller than the window, with their actions cut off;
- truncated times, dates, names, titles, scores and counts at 1.3, and units split across lines
  (a date, a time range, "3 / 10");
- dark mode: text or icons that vanish on the dark background, hard-coded light surfaces, a light
  flash before the theme applies;
- enabled buttons that look disabled, and tap targets under 44dp (text links like "Back to sign in");
- **colour contrast**, on every page, in light *and* dark. Judge by eye first (muted grey text, small
  captions, placeholders, inactive tab labels, badges, chips, outlined buttons, text on teal or navy),
  then *measure* every suspect instead of trusting the eye: crop the element, take the text colour (the
  most extreme glyph pixel) and the background beside it, and compute the WCAG ratio
  `(L1+0.05)/(L2+0.05)` on sRGB-linearised luminance. Pass is **4.5:1** for text (3:1 from 24px, or
  18.66px bold) and **3:1** for icons and control borders. Thin 10–12px text never reaches its true colour
  after anti-aliasing and JPEG, so treat a result within ~0.3 of the line as a pass. List every failing
  pair as screen, cell, element, text hex, background hex, ratio. Disabled controls are exempt;
  everything the user is meant to read or tap is not. A token-level fix (a text colour, an alpha on a
  muted label) is a native defect; a border or surface colour that v1 has too goes to the gaps file;
- copy and state that contradict another screen, and an empty state with no way forward.

Reading images: the session drops images after about 80–100 reads per agent ("media removed: request
limit"). With more shots than that, hand them to subagents in batches of at most ~80 and tell each
one to read no more than 3 images per message. Spot-check every High finding yourself.

## 5. Fix what's yours, report the rest

The v1-match ruling still holds, so sort each finding first:
- **Native-only defects** — keyboard, system bars, tab-bar clearance, font scale, small-phone overflow,
  dark-mode contrast that v1 doesn't have. v1 can't show what to do, so fix them natively, keeping v1's
  look (its class strings, spacing tokens, copy). These are part of the screen, not a separate request.
- **Defects v1 has too** (v1 truncates the same title, v1's own copy contradicts itself): don't
  diverge on your own. Record them in `docs/superpowers/ui-rebuild/gaps-batch-<n>.md` and raise them
  as owner questions.
- **Defects in screens the change didn't touch:** report them; don't fix them unasked.

After fixing, re-run the sweep for that flow until the shots are clean.

**Sheets are named by module.** The workflow's `module` input (student, leader, admin, super, mentor,
alumni) and the runner's `--module=` pick whose flows run: `.maestro/sweep/<module>-scenarios/`, plus,
for `student`, the signed-out and Settings flows beside the folders. The sheet, its title and its
artifacts are named for it (`student-ui-sweep.html`, `student-ui-sweep-contact-sheet`), so sheets for
different roles never get mixed up. A new role needs only its `<module>-scenarios/` folder.

**Report:** for each finding give its severity (High = hides or blocks something the user needs;
Medium = clearly broken or confusing; Low = polish), the cells it appears in, one or two sentences,
and the screenshot path. Then say what the sweep could not show:
- iOS — notch, home indicator, iOS keyboard and sheets (the sweep is Android-only; gesture nav is the
  nearest stand-in for the home indicator), though iOS is the platform the app ships to first;
- states that need a write (step 2), or data the reference users don't have;
- the camera (check-in QR scanning), the OS share sheet, notification permission prompts;
- any state your flow didn't reach.

If a finding exposes a new class of bug, add a one-line rule to **"Rules from the UI sweep"** in
`CLAUDE.md` so the next screen doesn't repeat it.

**Privacy:** shots show real users from the test database, the same as `.v1-reference/`. Never commit
them, never publish them as an Artifact or anywhere public. To show the user, send the contact sheet
or single shots privately (SendUserFile), as the batch comparison pages are sent.
