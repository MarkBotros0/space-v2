# UI sweep gaps (student sweep, runs of 2026-10-19 and 2026-10-20)

What the sweep found that v1 does too, or that needs an owner's call, so it was not changed on its own
(`.claude/skills/ui-sweep/SKILL.md` step 5). The native-only defects were fixed in PRs #30 and the one
after it; this file is what is left.

## Deviations from v1 made for contrast or font scale

Each one keeps v1's look at font 1.0 and in the normal case; they exist because v1 is a web page and
never measured these.

| Where | v1 | v2 | Why |
|---|---|---|---|
| Tab bar, inactive label | `text-white/55` | `text-white/80`, and `maxFontSizeMultiplier` 1.15 | 3.5–4.0:1 on the light-theme pill (needs 4.5); "Assignments" truncated at font 1.3 |
| Small muted labels (stat card, section card, eyebrow, "Graded …", attendance line, staff dashboard columns) | `text-muted-foreground/70` | `text-muted-foreground` | 2.2–4.0:1 on white and navy |
| Month grid, out-of-month day | `opacity-40` | `opacity-60` | date under 3:1 |
| Date picker, out-of-month day | `text-muted-foreground/50` | `text-muted-foreground` | under 3:1 |
| Stat card label | one line, overflows | at most two lines, shrinks to fit | "ASSIGNME / NTS", 3-line "ABSENCE BUDGET LEFT" at 1.3 |
| Textarea | `rows` | grows from `min-h-20` | fixed height clipped the placeholder at 1.3 |

## Owner questions (v1 has the same)

- **Control borders are about 1.2:1 on white and 1.3:1 on navy** (inputs, outline buttons, chips, the
  "Mark all read" chip), against 3:1 for a control's boundary. It is `border-input`/`border-border` in
  v1. Raising them changes every form's look.
- **The dark-theme tab pill is about 1.2:1 against the page.** Its icons and labels pass.
- **Disabled-looking primary buttons** (Save profile, Send reset code, Set new password, Activate
  account) are the disabled style on an empty form; disabled controls are exempt from contrast. The
  sweep never fills a form far enough to show the enabled state.
- **Read-only Email in Settings** is `opacity-50` text at 1.9:1 (light). It is a real label, not a
  disabled control.
- **Month grid event chips** show two letters ("Op…") on a phone: v1's grid has seven columns of chips.
- **Tap targets under 44dp:** "Take quiz", "Start quiz", "Mark all read", "Open settings", "← Dashboard",
  Save/Cancel on Profile, the user-menu rows.
- **History empty state** ("No past seasons") has no action.
- **The Home tab keeps its teal bubble on every page** (`featured`), as in v1's `nav-link.tsx`.
- **The page tint ends partway down short pages** in light mode, as in v1's role layouts.

## Not covered by the sweep

- **Quiz questions.** "Start quiz" creates an attempt, which is a write; the flows stop at the intro card.
- **Submitted and graded states** of an assignment, for the same reason.
- **iOS.** Notch, home indicator, iOS keyboard and sheets.
- **Staff roles.** Leader, admin and super have their own flows (`<module>-scenarios/`).
