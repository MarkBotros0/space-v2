READ-ONLY TASK. You are auditing, not building.

You may read anything in /home/mark/projects/JPC/space-v2 and anything in
/home/mark/projects/JPC/jpc-space. /home/mark/projects/JPC/jpc-space is
READ-ONLY: never write to it, never create a file in it, never run any git
command in it. Report anything wrong there; do not touch it.

You may write to EXACTLY ONE file — your ledger, named below — and you may only
APPEND to it. You may not edit any source file, any spec, any plan, or any
other file for any reason, including to "fix an obvious typo". You may not run
any command that writes to a database. You may not run tests. You may not run
prisma migrate, prisma db push, or prisma db execute.

SPECS: <the agent's spec list>
LEDGER: docs/superpowers/audits/2026-cutover/ledger-<A1|A2|A3>.tsv

YOUR JOB

For every numbered rule (a line beginning `- **R<n>.**`) in every spec assigned
to you, decide whether v2 does what the rule describes, and append exactly one
tab-separated row to your ledger.

WORK ONE SPEC AT A TIME, IN ORDER. Finish a spec's rules and append them before
opening the next spec. Do not read all your specs first. If you run low on
context, stop, append what you have, and report which rule number you reached —
a partial ledger with an honest stopping point is worth more than a complete
one with guessed rows.

THE ROW

spec      the spec's filename, e.g. 04-attendance.md
rule      the rule number, e.g. R63
verdict   exactly one of: PRESERVED | DIVERGED | DROPPED | NA | UNVERIFIED
v2_citation  a repo-relative path and line number, e.g.
             apps/backend/src/lib/check-in.ts:88
             or, for a multi-line behaviour, a range: ...:88-104
             Use the literal string "-" ONLY when the verdict is DROPPED or NA.
authority for DIVERGED: the decision id that authorised it — a ruling (C3),
          a spec decision (09-notes.md D4), or a plan decision (D-15.6).
          for DROPPED: the same, or the literal "UNAUTHORISED" if you cannot
          find one.
          for PRESERVED / NA / UNVERIFIED: "-"
note      one short sentence, under 25 words, no tabs. For UNVERIFIED, say
          exactly what you looked for and where you looked.

THE VERDICTS

PRESERVED   v2 does what the rule describes. You have opened the cited file and
            read the cited lines. The citation must be v2 code — a line in
            apps/backend, apps/mobile or packages/shared. A citation to a spec,
            a plan, or to jpc-space is NOT a citation; it is UNVERIFIED.

DIVERGED    v2 deliberately does something else, and you can name the decision
            that authorised it. Most v1 rules describing a defect land here —
            that is expected and correct. You MUST fill `authority`. If you
            cannot name a decision, the verdict is DROPPED with authority
            UNAUTHORISED, not DIVERGED. Do not invent an authority. Do not
            reason "this is obviously better" — someone's judgement being
            obvious is not a decision record.

DROPPED     v2 does not do this and nothing replaces it. Fill `authority` if a
            decision authorised the drop, otherwise UNAUTHORISED.

NA          The rule describes a v1 mechanism with no v2 counterpart at all —
            a Next.js `revalidatePath` call, a server-action return shape, a
            `useFormState` binding, a Tailwind class. NA is the easiest verdict
            to reach for and the easiest to be wrong about. Before using it,
            ask: does this rule describe a BEHAVIOUR a user could notice? If
            yes, it is not NA. "v1 revalidates /admin/season" is NA. "v1 shows
            the student their own group unscoped by season" is NOT NA — it is a
            behaviour, and v2 either reproduces it or diverges from it.

UNVERIFIED  You could not establish any of the above. This is a legitimate and
            useful verdict. Use it rather than guessing. The coordinator treats
            every UNVERIFIED row as a finding.

HOW TO SEARCH

Start from the spec's own §6/§7 mapping tables — most rules name the v1 file
they came from, and the corresponding v2 file is usually the same name under
apps/backend/src/routes/ or apps/backend/src/lib/. Then grep v2 for the
identifier, the error code, the route path or the column name the rule
mentions. Authorization rules almost always land in
apps/backend/src/lib/permissions.ts or apps/backend/src/lib/rbac.ts. Contract
rules land in packages/shared/src/. Screen rules land in apps/mobile/app/.

WHAT NOT TO DO

- Do not mark a rule PRESERVED because a plan says it will be. A plan is an
  intention. Cite the code or mark it UNVERIFIED.
- Do not mark a rule PRESERVED from a filename. Open the file.
- Do not batch-assign a verdict to a run of rules because they are adjacent.
- Do not summarise. One row per rule, including the boring ones.
- Do not quote spec text longer than 15 words into your note.
- Do not put any student's real name, email or note content into any row.

WHEN YOU FINISH

Report, in your final message and not in a file:
1. rows appended, per spec;
2. the counts per verdict, per spec;
3. every UNVERIFIED row's rule number, listed;
4. every DROPPED row with authority UNAUTHORISED, listed;
5. anything you found in v2 that no rule covers and that looks wrong.
Item 5 is not optional and "nothing" is an acceptable answer only if you mean it.
