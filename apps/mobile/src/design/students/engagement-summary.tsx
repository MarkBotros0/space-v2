/**
 * This season at a glance on a student's page: one card, three figures side
 * by side (attendance, assignments, quizzes) with their counts under them, and
 * "At risk" in the card's header when the server says so (C4, the single
 * definition). Replaces the three separate tiles (owner, 2026-11-07: the page
 * was a stack of boxes). No composite score (owner, 2026-11-07: nobody could
 * tell what it was). A 404 no_season shows nothing, as in v1.
 */
import { Fragment } from "react";
import { View } from "react-native";

import { isNoSeasonError, useStudentEngagement } from "../../hooks/use-engagement";
import { InlineError } from "../layout/route-states";
import { StatusChip } from "../ui/status-chip";
import { Text } from "../ui/text";

type Figure = { label: string; pct: number; detail?: string };

function FigureColumn({ label, pct, detail }: Figure) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${pct}%${detail ? `, ${detail}` : ""}`}
      className="min-w-0 flex-1 items-center gap-0.5 px-1"
    >
      <Text
        variant="title"
        tabular
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        maxFontSizeMultiplier={1.3}
      >
        {`${pct}%`}
      </Text>
      <Text
        variant="caption"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        maxFontSizeMultiplier={1.3}
        className="font-medium text-foreground"
      >
        {label}
      </Text>
      {detail ? (
        <Text variant="caption" numberOfLines={1} maxFontSizeMultiplier={1.3} className="text-muted-foreground">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

export function EngagementSummary({ studentId }: { studentId: number }) {
  const q = useStudentEngagement(studentId, true);
  if (q.isPending || (q.isError && isNoSeasonError(q.error))) return null;
  // A failed background refresh keeps the figures it had.
  if (!q.data) return <InlineError message="Couldn't load engagement." onRetry={() => void q.refetch()} />;
  const e = q.data;
  const figures: Figure[] = [
    { label: "Attendance", pct: e.attendancePct, detail: `${e.attendancePresent} of ${e.attendanceTotal}` },
    {
      label: "Assignments",
      pct: e.submissionPct,
      detail: `${e.submissionsCompleted} of ${e.submissionsExpected}`,
    },
    { label: "Quizzes", pct: e.quizPct, detail: `${e.quizzesTaken} of ${e.quizzesGiven}` },
  ];
  return (
    <View testID="engagement-summary" className="flex-col gap-3 rounded-group bg-surface p-4">
      <View className="min-h-[24px] flex-row items-center justify-between gap-2">
        <Text variant="caption" className="font-medium uppercase tracking-wide text-muted-foreground">
          THIS SEASON
        </Text>
        {e.atRisk ? <StatusChip tone="bad" label="At risk" className="shrink-0" /> : null}
      </View>
      <View className="flex-row items-stretch">
        {figures.map((f, i) => (
          <Fragment key={f.label}>
            {i > 0 ? <View className="w-px self-stretch bg-separator" /> : null}
            <FigureColumn {...f} />
          </Fragment>
        ))}
      </View>
    </View>
  );
}
