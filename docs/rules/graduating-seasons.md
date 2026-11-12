# Graduating seasons (owner, 2026-11-07)

> Owner ruling, moved verbatim from the root `CLAUDE.md` (2026-11-10). Backend paths are under
> `apps/backend/src/`, mobile paths under `apps/mobile/src/`, unless written in full.

Students graduate by passing a season a super marked **Graduating season**
(`Season.graduatesOnPass`; super-only, changeable until the season has finished).
End graduates everyone who passed in its own transaction, whoever ends it; the
class is the season's own `Season.year`, whenever it ends (a 2027 season ending in 2026
gives 2027), shown as "JPCS-YY", e.g. JPCS-27 for 2027 (owner 2026-11-10; never "School of" or "Class of"). End's body carries `reviewed`, what the staff member was shown; a different flag,
roster or score (`docs/rules/season-passing.md`) is refused, since everyone not named as not passed passes. Correcting a result to Passed on such a season graduates then; Did not pass
never removes alumni status. `POST /students/:id/graduate` is the exception: without
a pass it answers `not_qualified`, and `override: true` needs an `overrideReason` (trimmed,
10 to 1000 characters; else 400) and, in the app, a tick. Who, when and the reason are stored
on the user (`graduationOverrideAt/ById/Reason`) in the same transaction and shown to SUPER
only (`graduatedByException` on the student detail); the audit line says `override` and never
carries the reason, and no Sentry event may. `PATCH /users` accepts any class year from 1990
to 2100, so a graduate of a future-year season can still save. Backfills and old
results never graduate anyone. The app's second confirmation is the same sheet changing
its words: never close one modal and open another, iOS can drop the second.
