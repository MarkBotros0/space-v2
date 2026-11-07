import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { AT_RISK_PCT, type EngagementReportRow } from "@space/shared";

import { GroupedList, ListRow } from "../../design/ui";

/**
 * The mentor's at-risk students as a grouped list. No chips: the percentages
 * are words in the subtitle (no colour-only meaning) and the title gets two
 * lines so a long name never truncates (R33). `footer` is the last row.
 */
export function AtRiskGroup({
  rows,
  total,
  footer,
}: {
  rows: EngagementReportRow[];
  total: number;
  footer?: ReactNode;
}) {
  const router = useRouter();
  const header = total > rows.length ? `At risk · ${rows.length} of ${total}` : "At risk";
  return (
    <GroupedList header={header}>
      {rows.length === 0 ? (
        <ListRow
          title="Nobody at risk"
          subtitle={`No student has attendance or submissions below ${AT_RISK_PCT}%.`}
        />
      ) : (
        rows.map((r) => (
          <ListRow
            key={`${r.studentUserId}:${r.seasonId}`}
            title={r.name}
            titleLines={2}
            subtitle={`${r.seasonTitle} · ${r.attendancePct}% attendance · ${r.submissionPct}% submissions`}
            chevron
            onPress={() =>
              router.push({ pathname: "/student/[id]", params: { id: String(r.studentUserId) } })
            }
          />
        ))
      )}
      {footer}
    </GroupedList>
  );
}
