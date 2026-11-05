import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import {
  BAND_LABEL,
  BAND_ORDER,
  REPORT_METRIC_NOTES,
  type EngagementReportRow,
  type EngagementSummary,
} from "@space/shared";

import { BandDonut } from "../../components/charts/BandDonut";
import { RankedBars } from "../../components/charts/RankedBars";
import { TrendLine } from "../../components/charts/TrendLine";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  GroupedList,
  ListRow,
  StatTile,
  Text,
} from "../../design/ui";
import { InlineError } from "../../design/layout/route-states";
import { formatDayKey } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";

/**
 * An at-risk student as a row: season and both percentages in its meta line.
 * Server-derived, every one of them (ruling C4): the client renders what it is
 * given and computes no threshold of its own. User.name is NOT NULL in the
 * schema, so v1's name-or-email fallback has no case to cover.
 */
function AtRiskGroupedRow({ row }: { row: EngagementReportRow }) {
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
      chevron
      onPress={() =>
        router.push({ pathname: "/student/[id]", params: { id: String(row.studentUserId) } })
      }
    />
  );
}

/**
 * The engagement summary's cards, at-risk list first. `atRiskRows` is the
 * summary's own list, or every flagged student once "Show more" has loaded them.
 * Every role with a Reports surface sees this layout.
 */
export function EngagementCards({
  summary,
  atRiskRows,
  onShowMore,
  moreFailed = false,
}: {
  summary: EngagementSummary;
  atRiskRows: EngagementReportRow[];
  onShowMore: () => void;
  /** Show more failed: say so under the list; `onShowMore` is the retry. */
  moreFailed?: boolean;
}) {
  return (
    <>
      {/* The at-risk list comes FIRST on mobile. v1 puts it in the fourth card
          of a two-by-two grid (reports-view.tsx:64-108); stacked, that is four
          screens of scrolling before the only actionable element (spec §9). */}
      <View className="flex-col gap-2">
        <Text variant="headline" accessibilityRole="header">
          {`Students at risk (${atRiskRows.length} of ${summary.atRiskTotal})`}
        </Text>
        {atRiskRows.length === 0 ? (
          <Text variant="subhead" className="text-muted-foreground">
            Nobody flagged in this scope.
          </Text>
        ) : (
          <GroupedList>
            {atRiskRows.map((row) => (
              <AtRiskGroupedRow key={`${row.studentUserId}-${row.seasonId}`} row={row} />
            ))}
          </GroupedList>
        )}
        {moreFailed ? (
          <InlineError message="Couldn't load more students." onRetry={onShowMore} />
        ) : null}
      </View>
      {summary.atRiskTotal > atRiskRows.length ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-[44px] justify-center self-start"
          onPress={onShowMore}
        >
          <Text
            variant="subhead"
            className="font-medium text-brand-teal-800 dark:text-brand-teal-300"
          >
            Show more
          </Text>
        </Pressable>
      ) : null}

      {/* Bucket counts count ENROLMENTS, so a student in two in-scope seasons is
          counted twice and the total exceeds the headcount (R27, R32): both
          numbers sit side by side as tiles. */}
      <View testID="engagement-tiles" className="flex-row flex-wrap gap-3">
        <StatTile label="Enrolments" value={summary.enrollmentCount} />
        <StatTile label="Students" value={summary.cohortSize} />
        {BAND_ORDER.map((band) => (
          <StatTile
            key={band}
            label={band === "AT_RISK" ? BAND_LABEL[band] : `${BAND_LABEL[band]} engagement`}
            value={summary.bands.find((b) => b.band === band)?.count ?? 0}
          />
        ))}
      </View>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Engagement</CardTitle>
        </CardHeader>
        <CardContent>
          <BandDonut bands={summary.bands} />
        </CardContent>
      </Card>

      <TrendCompletionNotes summary={summary} />
    </>
  );
}

/** "Mar 1, 2099 – Mar 8, 2099", or just the one date when first and last are the same day. */
function trendRange(first: string, last: string): string {
  return first === last ? formatDayKey(first) : `${formatDayKey(first)} – ${formatDayKey(last)}`;
}

/** Trend, completion and method cards: the same for every role. */
function TrendCompletionNotes({ summary }: { summary: EngagementSummary }) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attendance trend</CardTitle>
        </CardHeader>
        <CardContent className="flex-col gap-1">
          {summary.attendanceTrend.length < 2 ? (
            <Text variant="subhead" className="text-muted-foreground">
              {summary.attendanceTrend.length === 0
                ? "No sessions yet: the trend starts after the first one."
                : "One session so far: the trend starts after the next one."}
            </Text>
          ) : (
            <TrendLine
              points={summary.attendanceTrend.map((p) => ({
                // The server's org-calendar day, labelled with the
                // timezone-free formatDayKey (X13). v1 formatted on the
                // server with date-fns and no year, so sessions from
                // different years collapsed onto one label (R15, R101, D12);
                // formatting startsAt on the device would instead show the
                // phone's calendar day.
                label: formatDayKey(p.dayKey),
                pct: p.pct,
                // One line per season (REG-117).
                series: { key: String(p.seasonId), label: p.seasonTitle },
              }))}
            />
          )}
          {summary.attendanceTrend.length > 0 ? (
            <Text className="text-xs text-muted-foreground">
              {trendRange(
                summary.attendanceTrend[0]!.dayKey,
                summary.attendanceTrend[summary.attendanceTrend.length - 1]!.dayKey,
              )}
            </Text>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          {/* Named "Completion rate", not "Submission %": it is a
          property of an assignment, and v1 calling both by one name
          is spec D2's most consequential ambiguity (D-17.1). */}
          <CardTitle className="text-base">Completion rate</CardTitle>
        </CardHeader>
        <CardContent>
          <RankedBars
            bars={summary.completion.map((r) => ({
              key: String(r.assignmentId),
              label: r.title,
              value: r.completionRate,
              caption:
                r.expected === 0
                  ? "No students targeted"
                  : `${r.completed} of ${r.expected} ${
                      r.targeting === "all_groups" ? "in the season" : "in the target groups"
                    }`,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How these numbers are calculated</CardTitle>
        </CardHeader>
        <CardContent className="flex-col gap-2">
          {/* The same strings the workbook's Key sheet renders. One
          definition, two renderers — the C4 discipline applied to
          prose, so a spreadsheet and the app cannot describe the same
          metric differently. */}
          {REPORT_METRIC_NOTES.map((note) => (
            <Text key={note} className="text-xs text-muted-foreground">
              {note}
            </Text>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
