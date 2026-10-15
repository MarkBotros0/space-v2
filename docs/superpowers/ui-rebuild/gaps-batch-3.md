# Batch 3 (leader) — remaining differences from v1

Every difference left between the v1 leader pages and the rebuilt v2 screens, with its reason: a platform detail, a ruling (B3-n in `docs/superpowers/plans/2026-10-15-ui-plan-03-leader.md`, or B2-n from batch 2), or a data gap. Captures: `~/projects/JPC/.v2-captures/batch-3/` (devbox only).

## Dashboard
- Attendance figures differ (v1 ring 13% / rows 0–17%; v2 0%): v2 reads the server's engagement figures (spec 19 D5, C4), which count attendance differently from v1's page arithmetic. Data, not layout.
- The ring is always teal, and row percentages are red because every listed row is at risk (D2: no 70/85 tiers). B3-4.
- The card lists only at-risk students ("Your students at risk") with "N/M submitted" instead of every student with "N pending" (D6, D4). B3-4.
- The callout reads "{n} students at risk" (the v2 rule: below 60%, attendance or submissions) instead of "Students below 70% attendance". B3-4.
- The events card shows its empty state where v1 renders nothing (D19, B2-9).
- "Session 12 of 12" / "Session 12/12" instead of "Week …" (D12).
- No season: v2 shows "No season yet"; v1 renders the dashboard with zeros. B3-4.
- The DEV user-switcher icon in v1's top bar is a dev tool, not ported.
