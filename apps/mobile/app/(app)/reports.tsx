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
import {
  useEngagementReport,
  useEngagementStudents,
  useOrganisationReport,
} from "../../src/hooks/use-reports";
import { formatDayKey } from "../../src/lib/format";
import { bandColor } from "../../src/lib/report-colors";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

function AtRiskRow({ row }: { row: EngagementReportRow }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: "/student/[id]", params: { id: String(row.studentUserId) } })
      }
      style={{ paddingVertical: theme.spacing.xs }}
    >
      {/* User.name is NOT NULL in the schema, so v1's name-or-email fallback
          (reports-view.tsx:91) has no case to cover and is not ported. */}
      <Text variant="body">{row.name}</Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {row.seasonTitle}
      </Text>
      {/* Server-derived, every one of them (ruling C4). The client renders what
          it is given and computes no threshold of its own. */}
      <Text variant="caption" color={bandColor(theme, row.band)}>
        {`${row.attendancePct}% attendance · ${row.submissionPct}% submissions`}
      </Text>
    </Pressable>
  );
}

function SeasonPicker({
  seasons,
  selected,
  onSelect,
}: {
  seasons: Array<{ id: number; title: string }>;
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  const theme = useTheme();
  const chip = (active: boolean) => ({
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    marginRight: theme.spacing.xs,
    backgroundColor: active ? theme.colors.brand.navy[900] : theme.colors.neutral[100],
  });

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Season filter: All seasons"
        accessibilityState={{ selected: selected === null }}
        onPress={() => onSelect(null)}
        style={chip(selected === null)}
      >
        <Text
          variant="label"
          color={selected === null ? theme.colors.neutral[50] : theme.colors.neutral[900]}
        >
          All seasons
        </Text>
      </Pressable>
      {seasons.map((s) => (
        <Pressable
          key={s.id}
          accessibilityRole="button"
          accessibilityLabel={`Season filter: ${s.title}`}
          accessibilityState={{ selected: selected === s.id }}
          onPress={() => onSelect(s.id)}
          style={chip(selected === s.id)}
        >
          <Text
            variant="label"
            color={selected === s.id ? theme.colors.neutral[50] : theme.colors.neutral[900]}
          >
            {s.title}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function OrganisationSection() {
  const theme = useTheme();
  const { data, isPending, isError, refetch } = useOrganisationReport(true);

  if (isPending) return <LoadingState />;
  if (isError) {
    return <ErrorState message="Couldn't load the organisation roll-up." onRetry={() => void refetch()} />;
  }

  return (
    <Card style={{ marginBottom: theme.spacing.md }}>
      <Text variant="heading">Organisation</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: theme.spacing.sm }}>
        {/* "Current students" in v1 counted student ACCOUNTS, including
            students never enrolled in anything (R51, spec D4). The label says
            what the number is. */}
        <View>
          <Text variant="caption">Student accounts</Text>
          <Text variant="heading">{String(data.totalStudentsNotGraduated)}</Text>
        </View>
        <View>
          <Text variant="caption">Alumni</Text>
          <Text variant="heading">{String(data.totalAlumni)}</Text>
        </View>
        <View>
          <Text variant="caption">Active seasons</Text>
          <Text variant="heading">{String(data.activeSeasonCount)}</Text>
        </View>
      </View>

      <View style={{ marginTop: theme.spacing.md }}>
        <Text variant="label">Active members per season</Text>
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
              value:
                data.seasons.reduce((n, x) => Math.max(n, x.activeCount), 0) > 0
                  ? Math.round(
                      (s.activeCount /
                        data.seasons.reduce((n, x) => Math.max(n, x.activeCount), 0)) *
                        100,
                    )
                  : null,
              caption: `${s.activeCount} active · ${s.completedCount} completed · ${s.withdrawnCount} dropped · ${s.leaderCount} leaders`,
            }))}
        />
      </View>

      <View style={{ marginTop: theme.spacing.md }}>
        <Text variant="label">Alumni by year</Text>
        {data.alumniByYear.map((a) => (
          <Text key={a.year} variant="body">{`${a.year}: ${a.count}`}</Text>
        ))}
      </View>
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
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Reports" message="This screen is for mentors and season admins." />
      </Screen>
    );
  }

  const handleRefresh = () => {
    void summary.refetch();
  };

  const extraRows = more.data?.pages.flatMap((p) => p.rows) ?? [];
  const atRiskRows = showAllAtRisk && extraRows.length > 0 ? extraRows : (summary.data?.atRisk ?? []);

  return (
    <Screen
      edges={["top", "left", "right"]}
      onRefresh={handleRefresh}
      refreshing={summary.isRefetching}
    >
      <Text variant="heading">Reports</Text>

      {summary.isPending ? (
        <LoadingState />
      ) : summary.isError ? (
        <ErrorState message="Couldn't load reports." onRetry={() => void summary.refetch()} />
      ) : (
        <>
          {isSuper ? <OrganisationSection /> : null}

          <SeasonPicker seasons={permitted} selected={seasonId} onSelect={setSeasonId} />

          {summary.data.scope.truncated ? (
            <Text variant="caption" color={theme.colors.warning[600]}>
              Some seasons you asked for aren&apos;t in your scope.
            </Text>
          ) : null}

          <ExportMenu
            seasonId={seasonId}
            scopeLabel={summary.data.scope.label}
            canExportWorkbook={
              seasonId !== null && (role === "SUPER" || role === "ADMIN")
            }
            exportDay={summary.data.exportDay}
          />

          {summary.data.enrollmentCount === 0 && summary.data.attendanceTrend.length === 0 ? (
            <EmptyState
              title="No data in this scope"
              message="Pick a season with activity, or wait until the first session has run."
            />
          ) : (
            <>
              {/* The at-risk list comes FIRST on mobile. v1 puts it in the
                  fourth card of a two-by-two grid (reports-view.tsx:64-108);
                  stacked, that is four screens of scrolling before the only
                  actionable element on the page (spec §9). */}
              <Card style={{ marginTop: theme.spacing.md }}>
                <Text variant="heading">
                  {`Students at risk (${atRiskRows.length} of ${summary.data.atRiskTotal})`}
                </Text>
                {atRiskRows.length === 0 ? (
                  <Text variant="body" color={theme.colors.neutral[600]}>
                    Nobody flagged in this scope.
                  </Text>
                ) : (
                  atRiskRows.map((row) => (
                    <AtRiskRow key={`${row.studentUserId}-${row.seasonId}`} row={row} />
                  ))
                )}
                {summary.data.atRiskTotal > atRiskRows.length ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setShowAllAtRisk(true);
                      if (more.hasNextPage) void more.fetchNextPage();
                    }}
                  >
                    <Text variant="label" color={theme.colors.brand.teal[700]}>
                      Show more
                    </Text>
                  </Pressable>
                ) : null}
              </Card>

              <Card style={{ marginTop: theme.spacing.md }}>
                <Text variant="heading">Engagement</Text>
                {/* Bucket counts count ENROLMENTS, so a student in two in-scope
                    seasons is counted twice and the total exceeds the headcount
                    (R27, R32). Both numbers, side by side. */}
                <Text variant="caption" color={theme.colors.neutral[600]}>
                  {`${summary.data.enrollmentCount} enrolments · ${summary.data.cohortSize} students`}
                </Text>
                <BandDonut bands={summary.data.bands} />
                {BAND_ORDER.map((band) => {
                  const entry = summary.data.bands.find((b) => b.band === band);
                  return (
                    <Text key={band} variant="body" color={bandColor(theme, band)}>
                      {`${BAND_LABEL[band]}: ${entry?.count ?? 0}`}
                    </Text>
                  );
                })}
              </Card>

              <Card style={{ marginTop: theme.spacing.md }}>
                <Text variant="heading">Attendance trend</Text>
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
                  }))}
                />
                {summary.data.attendanceTrend.length > 0 ? (
                  <Text variant="caption" color={theme.colors.neutral[600]}>
                    {`${formatDayKey(summary.data.attendanceTrend[0]!.dayKey)} – ${formatDayKey(
                      summary.data.attendanceTrend[summary.data.attendanceTrend.length - 1]!.dayKey,
                    )}`}
                  </Text>
                ) : null}
              </Card>

              <Card style={{ marginTop: theme.spacing.md }}>
                {/* Named "Completion rate", not "Submission %": it is a
                    property of an assignment, and v1 calling both by one name
                    is spec D2's most consequential ambiguity (D-17.1). */}
                <Text variant="heading">Completion rate</Text>
                <RankedBars
                  bars={summary.data.completion.map((r) => ({
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
              </Card>

              <Card style={{ marginTop: theme.spacing.md }}>
                <Text variant="heading">How these numbers are calculated</Text>
                {/* The same strings the workbook's Key sheet renders. One
                    definition, two renderers — the C4 discipline applied to
                    prose, so a spreadsheet and the app cannot describe the same
                    metric differently. */}
                {REPORT_METRIC_NOTES.map((note) => (
                  <Text key={note} variant="caption" color={theme.colors.neutral[600]}>
                    {note}
                  </Text>
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
