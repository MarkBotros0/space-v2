# Community model: one active role, seasons with gaps, pass results

Status: awaiting owner approval. Decisions below are the owner's (2026-11-06)
unless marked **Builder's call** or **Claude's call**.

## Why

People move through the community over years, and their role changes as they do:

1. A student joins and goes through seasons, each with a group, a leader and a
   season admin.
2. Between seasons there are long gaps. For example, one season runs February to
   May and the next starts in September.
3. Some students don't pass a season, and can't move on to the season that
   requires it.
4. A student who passes a graduating season graduates, and is an alumnus for good.
5. Alumni serve new students as leaders or admins. Sometimes a season is held for
   the whole community, alumni included.

The app can't represent this. One global `User.role` decides what a person is, an
alumnus is defined as "role STUDENT with `graduationYear` set", and
`StudentProfile.activeSeasonId` is one stored pointer that nothing moves when a
season ends.

**Live bugs this fixes:** marking a season COMPLETED changes neither enrolments nor
the pointer, so a finished season still reads as current and stays out of History.
Enrolling only sets the pointer if it's empty
(`lib/queries/students/writes.ts:142`), so a returning student stays stuck on the
old season. In the Neon copy, 82 student profiles point at a non-active season.
Today also tells a student who just finished to "Contact your leader or admin".

## Goals

- Someone's role comes from what they're doing now, not from a label on their account.
- "Between seasons" is a normal, calm state for students and alumni.
- The super admin builds each season by hand, with enough information to choose well.
- Who passed is recorded, and it's clear in selection who can't move on.

## Non-goals

- Self-enrolment or opt-in. People are always placed by staff.
- Automatic pass/fail.
- A serving/learning switcher. The one-role rule makes it unnecessary.
- Anti-goal: nobody may ever hold two active roles, however they got there.

## The core rule

**Every user has zero or one active role.** It must be enforced on every write, not
just in the UI.

| Situation | Allowed? |
|---|---|
| Alumnus serving in two seasons at once | No |
| Student in two active seasons | No |
| Alumnus both serving and a student in a community-wide season | No |
| Admin and group leader in the same season | **Yes**, this counts as one serving role |
| Leader of two groups in one season | **No**, one group per leader per season |
| Person with no active role | Yes, that's normal between seasons |
| Super admin or Mentor also holding a season role | No, those permanent roles are their one role |

Alumni status is a permanent fact about a person and is not a role. An alumnus who is
serving or studying still sees alumni-only events. (Claude's call, stated to the owner,
who did not object.)

"Active" means a role in a season whose status is ACTIVE. Season roles in a DRAFT
season don't count until it starts. In a COMPLETED or ARCHIVED season, the role has ended.

### Who may hold what

- **Season admin, group leader:** alumni only, strictly, with no override. All current
  staff already meet this.
- **Student in a regular season:** non-alumni only.
- **Student in a community-wide season:** anyone without another active role.
- **Super admin, Mentor:** permanent and community-wide, never in a season.

### Who may do what

| Action | Super admin | Season admin (own season only) |
|---|---|---|
| Create a season, set its required program | Yes | No |
| Assign season admins | Yes | No |
| Assign leaders | Yes | Yes |
| Add students to the season | Yes | Yes |
| Place students in groups | Yes | Yes |
| Drop a student, with a reason | Yes | Yes |
| Bring a dropped student back | Yes | No |
| Work on a draft season once appointed | Yes | Yes |
| Start a season | Yes | No (Claude's call: today only a super admin changes status; the owner only widened ending) |
| End a season and set results | Yes | Yes |
| Change a result afterwards | Yes | No |
| Override a "did not pass" block | Yes | No |
| Correct anything in a finished season | Yes | No |
| Mark a season as graduating | Yes | No |
| Graduate someone by exception | Yes | No |

### What people can see of earlier seasons

- Season admins and leaders see **nothing** from a student's earlier seasons, only the
  active or draft season they serve in. This changes today's student detail screen, which
  shows admins a student's other enrolments.
- **One exception, for choosing people only:** the student picker shows season admins the
  same information as the super admin (last seasons, how each ended, attendance).
- The leader picker shows a season admin only the name and last season.
- A student sees **all their own work read-only** in a finished season: submissions,
  leader feedback, quiz scores and attendance. Leaders' private notes stay hidden.
- **Former staff have no access to a finished season.** Once it ends, its admins and
  leaders can't open it, and it doesn't appear in their History. Only the super admin can.
- The super admin and Mentors keep their community-wide read access to every season.
  (Claude's call: the owner's "nothing earlier" answer was about new leaders and admins.)
- Notes with no season keep today's visibility rules. (Claude's call.)

## Season lifecycle

### Current season

A person's current season is derived, never stored: the season where their enrolment or
staff assignment is live and the season is ACTIVE. `activeSeasonId` stops being read and
written. Its column stays for now (migrations stay additive).

### Creating and preparing (DRAFT)

The super admin creates the season and appoints admins. Admins and the super admin can
then add people, set up groups and assign leaders while it's a draft. People may be placed
on a draft's roster even if they hold an active role elsewhere.

A **draft admin who has no other active role** gets the admin experience for that draft.
Someone still serving elsewhere can't work on the draft until that role ends; the super
admin prepares it meanwhile. (Claude's call.)

### Starting

Pressing Start runs the checks. If anyone fails, it opens a **checklist screen** rather than
starting: who is affected, why, and a way to remove them or open their other season. The
season starts once the list is clear. The checks are the one-role rule, eligibility, and
the required program, unless a super admin override is on record.

### Community-wide seasons

A flag on the season, set when it's created and changeable by a Super while it is a DRAFT. It can only **start when no other season is
active**, and no other season can start while it runs. Everyone takes part as a **full
student** (group, leader, attendance, assignments, quizzes). Its staff are appointed like
any season. The super admin chooses people with **Select all available** and can untick;
people who join the community later are added by hand. It has pass results like any season.

Owner rulings (2026-11-07):

- A community-wide season has **no required program and graduates nobody**; it keeps pass results.
  The two options are refused with it (`community_wide_rules`) and the form hides them once it is on.
- **Select all available ticks both tabs** (Students and Alumni) and shows the count, e.g.
  `Select all available (186)`.
- **Graduating never ends a place in a community-wide season.** Someone who graduates while studying in
  one (the exception, or a corrected result) stays in it as an alumnus, ACTIVE or DRAFT, and gets a result
  at End like everyone else. Regular-season places still end.

Regular seasons may run in parallel with each other; the rule is per person.

### Ending

Someone presses **End season**. It never ends by date. Once the end date passes, the season's
admins and the super admin get a reminder. (Builder's call how; no cron exists today, so an
in-app callout on Today is enough.)

**A season can't end while work is unfinished.** Pressing End first lists what's blocking it, with a
way to open each item:

- submissions waiting for review
- quiz attempts waiting for grading
- attendance not marked for sessions that have already happened

There is no way to force it past these. A super admin can clear anything a leader has left behind.
Things only a student could finish don't block it: unsubmitted drafts and in-progress quiz attempts
close as they are, and sessions that haven't happened yet don't count. (Claude's call on what counts
and on having no force option.)

Once clear, End opens a **review list**: every active student with their attendance, all preset to
Passed. Staff mark who didn't pass and may record a reason. Confirming, in one transaction:
sets the season COMPLETED, completes every active enrolment with its result, and ends all
roles in that season. Everyone affected sees the change promptly (see Tokens).

### After a season ends

A finished season is locked. No write path accepts changes from anyone but the super admin, who can
correct anything in it directly. There is no reopening: a finished season never becomes active again,
so nobody's role comes back and the one-role rule can't be broken this way. The lock is new work; no
write gate depends on season status today.

### Pass results

- New on an enrolment: **Passed** or **Did not pass**, set when the season ends, with an optional
  private reason. `WITHDRAWN` stays as it is. Dropped is a different outcome from Did not pass.
- A season can name a **required program** (`Season.program` is the existing string, e.g. LEAD
  requires GBV). A student's standing comes from their latest finished season in that program.
- **Blocked** when that latest result is Did not pass, or the student has never finished that
  program. (Claude's call on the "never finished" half, since "must be passed first" reads that way.)
- A student who didn't pass may retake the same program: its next season doesn't require itself. So
  someone who didn't pass GBV 2026 can join GBV 2027, but is blocked from LEAD 2027 if LEAD requires GBV.
- Someone who already passed a program can be added to it again, but they're labelled "Already passed"
  and Select all skips them. (Claude's call.)
- A season with no required program blocks nobody, though the last result is still shown.
- A super admin can **override** a block for one person with one confirmation. A season admin can't.
- Staff writing a reason should know the student never sees it. **Students see the result in plain
  words** ("Passed", "Did not pass") on Today and History, not the reason.
- Not passing a community-wide season never removes alumni status. (Claude's call.)

### Dropping and bringing back

A season admin or super admin drops a student with a reason. Only a super admin brings them back.
This needs a new path, because today a WITHDRAWN enrolment is final and there's one enrolment per
student per season, ever (`routes/students/enrollments.ts`). The rule is re-checked on the way back.

A dropped student's Today says "You're not in a season right now", with no request to contact anyone.
History lists the season as "Did not finish", and they can still read their own work read-only, both
while the season runs and afterwards. The drop reason stays private to staff.

### Graduation

**Owner, 2026-11-07:** students graduate by passing a specific season. A super admin ticks **Graduating season** on a season, and can change it until the season has finished.

- **Automatic at End.** When a graduating season ends, in the same transaction, every student whose result is Passed and who isn't already an alumnus becomes one. The class is the season's own `Season.year`, whenever it ends (owner, 2026-11-07), shown as "School of {year}"; the graduating season is usually called JPC School. The End review warns "Passing makes them School of {year}", and the confirm gives the count. Staff of any kind may end the season, so a season admin's End graduates people too.
- **Exception.** A super admin can graduate someone who hasn't passed a graduating season, as a very rare exception (owner, 2026-11-07: "add the option, but add a lot of warnings"). The sheet states the consequences, and needs a written reason (10 to 1000 characters) and a tick. Who, when and the reason are stored on the user and shown to super admins only; the audit log records that an override was used, never the reason. Graduating someone mid-season still completes their active enrolment, with no pass result recorded. (Claude's call.)
- **Corrections.** Changing a result to Passed on a graduating season graduates the student then. Changing one to Did not pass doesn't remove alumni status, and the screen says so. (Claude's call.)
- Filling in old results never graduates anyone. Alumni who graduated before this rule stay alumni. (Claude's call.)
- Duplicating a season copies the flag. (Claude's call.)

## Selection: the people picker

Used to add people to a season, by the super admin and season admins. Must handle about 200 people
on a phone, so use a virtualised list.

```
Add people to LEAD 2027 (requires GBV)
[ Students | Alumni ]
[Search...               ]
(Last season: Any v) (Available)
[Select all available]
-------------------------------
[x] Peter Samy
    GBV 2026 - Passed - 88%
[ ] Nour Hany
    GBV 2026 - Passed - 95%
-------------------------------
Did not pass
Sara Nabil
Did not pass GBV 2026 - 40%
[Override] (super admin only)
-------------------------------
Already in a role
Mina Adel
Leading a group in GBV 2026
-------------------------------
[     Add 12 people      ]
```

- Each person shows their last season, how it ended (Passed, Did not pass, Dropped) and attendance.
- Unavailable people stay listed, after the available ones, with no tick box and the reason in words.
  Don't dim them: text stays at the project's 4.5:1 contrast. Never rely on colour alone.
- **Select all available** skips anyone blocked or in a role.
- The Alumni tab is only offered for community-wide seasons, since alumni can't be students otherwise.
- A draft allows people with active roles to be ticked, and the Start checklist catches them. The
  label still shows, so staff know. Anywhere else, assigning someone with an active role is **refused
  with the reason**, e.g. "Mina is already leading a group in GBV 2026". Never move them automatically.

The leader picker lists any alumnus with no active role, showing name and last season only. An admin
can also remove a leader.

## Screens

Use the `ui-ux-pro-max` skill for all UI work, on top of the app's design system: the rules in this
repo's `CLAUDE.md` win where they differ. Run `ui-sweep` on every new or changed screen.

**Between-seasons Today**, for students and alumni with no current season:
```
Hi, Mina
Tuesday 9 June
-------------------------------
GBV 2026 finished
Passed - 92% attendance
[View your season        >]
-------------------------------
You'll see your next season
here when you're added.
-------------------------------
Upcoming events
Community day - 20 June
```
Never asks them to contact anyone. It replaces "Not enrolled yet" for anyone who has finished a
season; someone who has never been in one still gets a first-time message. Someone whose last season
ended in a drop gets the message under "Dropping and bringing back".

**Tabs.** They follow the current role.

| State | Tabs |
|---|---|
| Student in a season | Today, Calendar, To do, Submitted, More |
| Student between seasons | Today, Calendar, History, More |
| Alumnus with no role | Today, Events, History, Profile, More (as now) |
| Alumnus serving or studying | The tabs for that role |
| Ended serving | Back to the alumnus tabs |

**Finished season page**, opened from Today or History: one page with the result and attendance at the
top, then Assignments, Quizzes and Attendance rows opening the existing screens with no submit or edit
controls.

**Staff side:** the people picker and leader picker, the End season blockers and review list, the Start checklist,
result and required-program fields, and season-setup entry points on the season screen.

## Existing data

- Existing **Completed** enrolments become **Passed**. Dropped stays dropped. A super admin can correct
  individuals.
- In seasons already COMPLETED, ACTIVE enrolments are completed and marked Passed, which also clears
  the 82 stale pointers' effect.
- Nobody breaks the one-role rule in the Neon copy (36 people with active roles, none in two seasons,
  no leader with two groups in a season). **Re-check every rule on the live Prisma Postgres database
  before migrating**, including Mentors or Supers with season rows; local `.env` points at Neon. If
  anything breaks a rule, stop and report it to the owner. Nothing is removed automatically. (Claude's call.)
- All 11 current admins, leaders and mentors have a `graduationYear`, and need no backfill.

## Implementation constraints

- **Today's gates that must change:** `isAdminOfSeason` and `isLeaderOfGroup` require a global role
  (`lib/rbac.ts`); `addSeasonAdmin` refuses unless the target's role is ADMIN
  (`routes/seasons/admins.ts`); the group form accepts only role LEADER
  (`lib/queries/groups/membership.ts:39`).
- **Tokens.** Claims must stay `jose` HS256, audience `jpc-mobile`, 900s TTL. A person's role must take
  effect promptly when a season starts or ends, including for everyone in it at once, not only on
  their next login. `sessionsValidFrom` and refresh-token revocation are the existing tools.
- **Migrations are additive.** Say in the commit which environments they reached.
- Shared contracts are Zod, the OpenAPI doc changes in the same commit as its route, files stay under
  400 lines, and integration tests run serially on staging.
- Motion stays restrained: no new animations.

## Rollout: three TestFlight builds

1. **Gaps.** Derived current season, End season with blockers, review and results, the finished-season
   lock and former-staff cut-off, data clean-up, between-seasons and dropped states, finished season page.
   Fixes the live bugs first. Former staff keep their global role and tabs until build 2, so their season
   lists can look empty for one TestFlight cycle. (Claude's call.)
2. **Roles.** One-role enforcement, roles from season rows, alumni serving, the pickers, Start checklist,
   required program, overrides, bring back, graduating seasons, cutting staff access to earlier seasons.
3. **Community-wide seasons.** The flag, the start rule, Select all, alumni as students.

## Left to the builder

- Schema shape for the permanent role, the result, the community flag and the required program, and how
  the token's `role` is derived for existing callers.
- Whether the one-role rule also gets a database constraint, given it spans three tables; the
  transaction-level check is required either way.
- How the reminder is delivered, and exact copy within the wording above.
