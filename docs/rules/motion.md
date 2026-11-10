# Motion: calm and quick (owner, 2026-11-06 and 2026-11-07)

> Owner ruling, moved verbatim from the root `CLAUDE.md` (2026-11-10). Backend paths are under
> `apps/backend/src/`, mobile paths under `apps/mobile/src/`, unless written in full.

It is an educational app: motion is for orientation, never decoration or play. The owner
found the tab bar, the sheets and the segmented control bouncy and "like a cartoon".
- No springs, overshoot or bounce anywhere: `withTiming` + `EASE_OUT`, stopping dead.
  Sheets rise in 260 ms; the pill highlight and the segmented thumb slide in `DURATION.fast`.
- Tabs switch instantly. Lists, rows, chips and numbers appear at once: no entrance
  animations, no stagger, no count-ups, no pulses, no scale on press (press dims instead).
- Light actions beside content (See all, Clear due date) are a `PillButton`; nothing is
  underlined (owner, 2026-11-07).
- Kept: the native stack push, sheet/modal fades, the skeleton shimmer, the check drawing
  itself on check-in, and the launch logo writing itself once per cold start.
- The launch hand-over (owner, 2026-11-10): the C writes with the J and P and both dots tap in
  together (1.85 s); then the letters fade and the two dots gather in the centre and circle as the
  loader while boot runs (at least half a turn, the one loop besides the skeleton); when boot is
  done the circle they trace opens onto the app. Reduced motion keeps a plain crossfade.
  Code: `apps/mobile/src/design/brand/launch-motion.ts`.
- One motion per interaction. Don't add new animations unless the owner asks; always
  honour reduced motion.
