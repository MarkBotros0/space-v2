import { Fragment, useState, type ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import {
  REPORT_METRIC_NOTES,
  type EngagementReportRow,
  type EngagementSummary,
} from "@space/shared";

import { BandDonut } from "../../components/charts/BandDonut";
import { RankedBars } from "../../components/charts/RankedBars";
import { TrendLine } from "../../components/charts/TrendLine";
import { GroupedList, ListRow, PillButton, Text } from "../../design/ui";
import { InlineError } from "../../design/layout/route-states";
import { formatDayKey } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";

/** One titled card of the report. */
function ReportCard({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <View className="flex-col gap-3 rounded-group bg-surface p-4">
      <View className="gap-0.5">
        <Text variant="headline" accessibilityRole="header">
          {title}
        </Text>
        {caption ? (
          <Text variant="caption" className="text-muted-foreground">
            {caption}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/**
 * The scope in three numbers. Enrolments shows only when it differs from
 * students: a student in two seasons in scope is counted once there and twice
 * in the bands (R27, R32).
 */
function Figures({ summary }: { summary: EngagementSummary }) {
  const figures = [
    { label: "Students", value: summary.cohortSize },
    ...(summary.enrollmentCount !== summary.cohortSize
      ? [{ label: "Enrolments", value: summary.enrollmentCount }]
      : []),
    { label: "At risk", value: summary.atRiskTotal },
  ];
  return (
    <View
      testID="engagement-tiles"
      className="flex-row items-stretch rounded-group bg-surface py-4"
    >
      {figures.map((f, i) => (
        <Fragment key={f.label}>
          {i > 0 ? <View className="w-px self-stretch bg-separator" /> : null}
          <View
            accessible
            accessibilityLabel={`${f.label}: ${f.value}`}
            className="min-w-0 flex-1 items-center gap-0.5 px-1"
          >
            <Text
              variant="title"
              tabular
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              className={f.label === "At risk" && f.value > 0 ? "text-bad" : undefined}
            >
              {String(f.value)}
            </Text>
            <Text
              variant="caption"
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              className="text-muted-foreground"
            >
              {f.label}
            </Text>
          </View>
        </Fragment>
      ))}
    </View>
  );
}

/**
 * An at-risk student as a row: season and both percentages in its meta line.
 * Server-derived, every one of them (ruling C4). `canOpen` is false for a
 * season the caller no longer serves (a finished one from History), whose
 * student pages they can't read.
 */
function AtRiskRow({ row, canOpen }: { row: EngagementReportRow; canOpen: boolean }) {
  const router = useRouter();
  return (
    <ListRow
      title={row.name}
      subtitle={joinMeta([
        row.seasonTitle,
        `${row.attendancePct}% attendance · ${row.submissionPct}% submissions`,
      ])}
      titleLines={2}
      subtitleLines={3}
      chevron={canOpen}
      onPress={
        canOpen
          ? () =>
              router.push({ pathname: "/student/[id]", params: { id: String(row.studentUserId) } })
          : undefined
      }
    />
  );
}

/** "Mar 1, 2099 – Mar 8, 2099", or just the one date when first and last are the same day. */
function trendRange(first: string, last: string): string {
  return first === last ? formatDayKey(first) : `${formatDayKey(first)} – ${formatDayKey(last)}`;
}

function AttendanceTrend({ summary }: { summary: EngagementSummary }) {
  const trend = summary.attendanceTrend;
  return (
    <ReportCard
      title="Attendance trend"
      caption={
        trend.length > 0 ? trendRange(trend[0]!.dayKey, trend[trend.length - 1]!.dayKey) : undefined
      }
    >
      {trend.length < 2 ? (
        <Text variant="subhead" className="text-muted-foreground">
          {trend.length === 0
            ? "No sessions yet: the trend starts after the first one."
            : "One session so far: the trend starts after the next one."}
        </Text>
      ) : (
        <TrendLine
          points={trend.map((p) => ({
            // The server's org-calendar day, labelled with the timezone-free
            // formatDayKey (X13, R15, R101, D12).
            label: formatDayKey(p.dayKey),
            pct: p.pct,
            // One line per season (REG-117).
            series: { key: String(p.seasonId), label: p.seasonTitle },
          }))}
        />
      )}
    </ReportCard>
  );
}

/** The same strings the workbook's Key sheet renders (C4 applied to prose), folded away until asked for. */
function HowCalculated() {
  const [open, setOpen] = useState(false);
  return (
    <View className="flex-col gap-2">
      <PillButton
        className="self-start"
        label={open ? "Hide how it's calculated" : "How are these calculated?"}
        onPress={() => setOpen((o) => !o)}
      />
      {open ? (
        <View className="flex-col gap-2 rounded-group bg-surface p-4">
          {REPORT_METRIC_NOTES.map((note) => (
            <Text key={note} variant="caption" className="text-muted-foreground">
              {note}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * One season's report (owner, 2026-11-07: structured logically). Who needs
 * help comes first, as it is the only thing to act on: the figures, then the
 * at-risk students. Then how the season is going: engagement bands, the
 * attendance trend, assignment completion. The method notes are last, folded.
 */
export function EngagementCards({
  summary,
  atRiskRows,
  onShowMore,
  moreFailed = false,
  canOpenStudent = () => true,
}: {
  summary: EngagementSummary;
  atRiskRows: EngagementReportRow[];
  onShowMore: () => void;
  /** Show more failed: say so under the list; `onShowMore` is the retry. */
  moreFailed?: boolean;
  canOpenStudent?: (row: EngagementReportRow) => boolean;
}) {
  return (
    <>
      <Figures summary={summary} />

      <View className="flex-col gap-2">
        {atRiskRows.length === 0 ? (
          <ReportCard title="Students at risk">
            <Text variant="subhead" className="text-muted-foreground">
              Nobody is flagged. Everyone is above the at-risk line.
            </Text>
          </ReportCard>
        ) : (
          <GroupedList header={`Students at risk (${atRiskRows.length} of ${summary.atRiskTotal})`}>
            {atRiskRows.map((row) => (
              <AtRiskRow
                key={`${row.studentUserId}-${row.seasonId}`}
                row={row}
                canOpen={canOpenStudent(row)}
              />
            ))}
          </GroupedList>
        )}
        {moreFailed ? (
          <InlineError message="Couldn't load more students." onRetry={onShowMore} />
        ) : null}
        {summary.atRiskTotal > atRiskRows.length ? (
          <PillButton className="self-start" label="Show more" onPress={onShowMore} />
        ) : null}
      </View>

      <ReportCard title="Engagement" caption="Every student by how engaged they are this season.">
        <BandDonut bands={summary.bands} />
      </ReportCard>

      <AttendanceTrend summary={summary} />

      {/* "Completion rate", not "Submission %": it is a property of an assignment (D-17.1). */}
      <ReportCard
        title="Assignment completion"
        caption="Share of the expected students who handed each one in."
      >
        {summary.completion.length === 0 ? (
          <Text variant="subhead" className="text-muted-foreground">
            No assignments yet.
          </Text>
        ) : (
          <RankedBars
            bars={summary.completion.map((r) => ({
              key: String(r.assignmentId),
              label: r.title,
              value: r.completionRate,
              caption:
                r.expected === 0
                  ? "No students targeted"
                  : `${r.completed} of ${r.expected} ${r.targeting === "all_groups" ? "in the season" : "in the target groups"}`,
            }))}
          />
        )}
      </ReportCard>

      <HowCalculated />
    </>
  );
}
