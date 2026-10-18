import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import {
  BAND_LABEL,
  BAND_ORDER,
  REPORT_METRIC_NOTES,
  type EngagementReportRow,
} from "@space/shared";

import { BandDonut } from "../../src/components/charts/BandDonut";
import { RankedBars } from "../../src/components/charts/RankedBars";
import { TrendLine } from "../../src/components/charts/TrendLine";
import { ExportMenu } from "../../src/components/ExportMenu";
import { PageTitle } from "../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import { cn } from "../../src/design/lib/cn";
import { Card, CardContent, CardHeader, CardTitle, EmptyState, Text } from "../../src/design/ui";
import {
  useEngagementReport,
  useEngagementStudents,
  useOrganisationReport,
} from "../../src/hooks/use-reports";
import { formatDayKey } from "../../src/lib/format";
import { bandColor } from "../../src/lib/report-colors";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";

/** v1 reports-view.tsx at-risk row: name over season, the two percentages on the right. */
function AtRiskRow({ row, last }: { row: EngagementReportRow; last: boolean }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() =>
        router.push({ pathname: "/student/[id]", params: { id: String(row.studentUserId) } })
      }
      className={cn("py-2 active:opacity-70", !last && "border-b border-border")}
    >
      {/* User.name is NOT NULL in the schema, so v1's name-or-email fallback
          (reports-view.tsx:91) has no case to cover and is not ported. */}
      <Text className="text-sm font-medium">{row.name}</Text>
      <Text className="text-xs text-muted-foreground">{row.seasonTitle}</Text>
      {/* Server-derived, every one of them (ruling C4). The client renders what
          it is given and computes no threshold of its own. */}
      <Text className="text-xs" style={{ color: bandColor(theme, row.band) }}>
        {`${row.attendancePct}% attendance · ${row.submissionPct}% submissions`}
      </Text>
    </Pressable>
  );
}

/** V2-ONLY: v1 scoped each report page to one season by URL; v2 filters in place. */
function SeasonPicker({
  seasons,
  selected,
  onSelect,
}: {
  seasons: Array<{ id: number; title: string }>;
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  const options: Array<{ id: number | null; title: string }> = [
    { id: null, title: "All seasons" },
    ...seasons,
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
      {options.map((o) => {
        const active = selected === o.id;
        return (
          <Pressable
            key={o.id ?? "all"}
            accessibilityRole="button"
            accessibilityLabel={`Season filter: ${o.title}`}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(o.id)}
            className={cn(
              "rounded-lg border px-3 py-2",
              active
                ? "border-brand-teal-500 bg-brand-teal-50 dark:bg-brand-teal-950"
                : "border-border bg-card",
            )}
          >
            <Text
              className={cn(
                "text-sm font-semibold",
                active ? "text-brand-teal-800 dark:text-brand-teal-200" : "text-muted-foreground",
              )}
            >
              {o.title}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function OrganisationSection() {
  const { data, isPending, isError, refetch } = useOrganisationReport(true);

  if (isPending) return <RouteSkeleton />;
  if (isError) return <RouteError onRetry={() => void refetch()} />;

  const maxActive = data.seasons.reduce((n, x) => Math.max(n, x.activeCount), 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Organisation</CardTitle>
      </CardHeader>
      <CardContent className="flex-col gap-4">
        <View className="flex-row justify-between">
          {/* "Current students" in v1 counted student ACCOUNTS, including
              students never enrolled in anything (R51, spec D4). The label says
              what the number is. */}
          {[
            ["Student accounts", data.totalStudentsNotGraduated],
            ["Alumni", data.totalAlumni],
            ["Active seasons", data.activeSeasonCount],
          ].map(([label, value]) => (
            <View key={label}>
              <Text className="text-xs text-muted-foreground">{label}</Text>
              <Text className="text-lg font-black text-brand-navy-900 dark:text-foreground">
                {String(value)}
              </Text>
            </View>
          ))}
        </View>

        <View className="flex-col gap-2">
          <Text className="text-sm font-medium">Active members per season</Text>
          {/* v1 drew a pie with one labelled slice per season on a 240px square
              (R60, R97) and coloured it by palette index, implying a severity
              ranking that does not exist (R93). A ranked list carries the same
              information and reads at 375px. */}
          <RankedBars
            bars={[...data.seasons]
              .sort((a, b) => b.activeCount - a.activeCount)
              .map((s) => ({
                key: String(s.seasonId),
                label: s.title,
                value: maxActive > 0 ? Math.round((s.activeCount / maxActive) * 100) : null,
                caption: `${s.activeCount} active · ${s.completedCount} completed · ${s.withdrawnCount} dropped · ${s.leaderCount} leaders`,
              }))}
          />
        </View>

        <View className="flex-col gap-1">
          <Text className="text-sm font-medium">Alumni by year</Text>
          {data.alumniByYear.map((a) => (
            <Text key={a.year} className="text-sm">{`${a.year}: ${a.count}`}</Text>
          ))}
        </View>
      </CardContent>
    </Card>
  );
}

export default function ReportsScreen() {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);

  // LEADER and STUDENT have no surface in this domain (R109, R110) and the API
  // refuses them explicitly. The screen does not ask.
  const canView = role === "SUPER" || role === "ADMIN" || role === "MENTOR";
  const isSuper = role === "SUPER";

  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [showAllAtRisk, setShowAllAtRisk] = useState(false);

  const summary = useEngagementReport(seasonId, canView);
  const more = useEngagementStudents(seasonId, "AT_RISK", canView && showAllAtRisk);

  // The picker's options come from the FIRST unscoped response's scope, which
  // already lists exactly the seasons this caller is permitted. A separate
  // GET /api/v1/seasons would be a second round trip for data in hand.
  const [permitted, setPermitted] = useState<Array<{ id: number; title: string }>>([]);
  // useEffect, not useMemo: this sets state. A useMemo that calls a setter
  // renders-during-render and React 19 will warn (and in StrictMode run it
  // twice). The guard on `seasonId === null` is what keeps the option list from
  // collapsing to one entry after the user picks a season.
  useEffect(() => {
    if (seasonId === null && summary.data) {
      setPermitted(summary.data.scope.seasons.map((s) => ({ id: s.id, title: s.title })));
    }
  }, [seasonId, summary.data]);

  if (!canView) {
    return (
      <ShellFrame>
        <EmptyState title="Reports" description="This screen is for mentors and season admins." />
      </ShellFrame>
    );
  }

  const handleRefresh = () => {
    void summary.refetch();
  };

  const extraRows = more.data?.pages.flatMap((p) => p.rows) ?? [];
  const atRiskRows =
    showAllAtRisk && extraRows.length > 0 ? extraRows : (summary.data?.atRisk ?? []);

  return (
    <ShellFrame onRefresh={handleRefresh} refreshing={summary.isRefetching}>
      <View className="flex-col gap-4">
        <PageTitle
          title="Reports"
          subtitle={summary.data ? `Scoped to ${summary.data.scope.label}.` : undefined}
        />

        {summary.isPending ? (
          <RouteSkeleton />
        ) : summary.isError ? (
          <RouteError onRetry={() => void summary.refetch()} />
        ) : (
          <>
            {isSuper ? <OrganisationSection /> : null}

            <SeasonPicker seasons={permitted} selected={seasonId} onSelect={setSeasonId} />

            {summary.data.scope.truncated ? (
              <Text className="text-xs text-warning-700 dark:text-warning-300">
                Some seasons you asked for aren&apos;t in your scope.
              </Text>
            ) : null}

            <ExportMenu
              seasonId={seasonId}
              scopeLabel={summary.data.scope.label}
              canExportWorkbook={seasonId !== null && (role === "SUPER" || role === "ADMIN")}
              exportDay={summary.data.exportDay}
            />

            {summary.data.enrollmentCount === 0 && summary.data.attendanceTrend.length === 0 ? (
              <EmptyState
                title="No data in this scope"
                description="Pick a season with activity, or wait until the first session has run."
              />
            ) : (
              <>
                {/* The at-risk list comes FIRST on mobile. v1 puts it in the
                    fourth card of a two-by-two grid (reports-view.tsx:64-108);
                    stacked, that is four screens of scrolling before the only
                    actionable element on the page (spec §9). */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {`Students at risk (${atRiskRows.length} of ${summary.data.atRiskTotal})`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {atRiskRows.length === 0 ? (
                      <Text className="text-sm italic text-muted-foreground">
                        Nobody flagged in this scope.
                      </Text>
                    ) : (
                      atRiskRows.map((row, i) => (
                        <AtRiskRow
                          key={`${row.studentUserId}-${row.seasonId}`}
                          row={row}
                          last={i === atRiskRows.length - 1}
                        />
                      ))
                    )}
                    {summary.data.atRiskTotal > atRiskRows.length ? (
                      <Pressable
                        accessibilityRole="button"
                        className="mt-2 self-start"
                        onPress={() => {
                          setShowAllAtRisk(true);
                          if (more.hasNextPage) void more.fetchNextPage();
                        }}
                      >
                        <Text className="text-sm font-medium text-brand-teal-700 dark:text-brand-teal-300">
                          Show more
                        </Text>
                      </Pressable>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Engagement</CardTitle>
                    {/* Bucket counts count ENROLMENTS, so a student in two in-scope
                        seasons is counted twice and the total exceeds the headcount
                        (R27, R32). Both numbers, side by side. */}
                    <Text className="text-xs text-muted-foreground">
                      {`${summary.data.enrollmentCount} enrolments · ${summary.data.cohortSize} students`}
                    </Text>
                  </CardHeader>
                  <CardContent className="flex-col gap-1">
                    <BandDonut bands={summary.data.bands} />
                    {BAND_ORDER.map((band) => {
                      const entry = summary.data.bands.find((b) => b.band === band);
                      return (
                        <Text
                          key={band}
                          className="text-sm"
                          style={{ color: bandColor(theme, band) }}
                        >
                          {`${BAND_LABEL[band]}: ${entry?.count ?? 0}`}
                        </Text>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Attendance trend</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-col gap-1">
                    <TrendLine
                      points={summary.data.attendanceTrend.map((p) => ({
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
                    {summary.data.attendanceTrend.length > 0 ? (
                      <Text className="text-xs text-muted-foreground">
                        {`${formatDayKey(summary.data.attendanceTrend[0]!.dayKey)} – ${formatDayKey(
                          summary.data.attendanceTrend[summary.data.attendanceTrend.length - 1]!
                            .dayKey,
                        )}`}
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
                      bars={summary.data.completion.map((r) => ({
                        key: String(r.assignmentId),
                        label: r.title,
                        value: r.completionRate,
                        caption:
                          r.expected === 0
                            ? "No students targeted"
                            : `${r.completed} of ${r.expected} ${
                                r.targeting === "all_groups"
                                  ? "in the season"
                                  : "in the target groups"
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
            )}
          </>
        )}
      </View>
    </ShellFrame>
  );
}
