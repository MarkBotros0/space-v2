import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { AT_RISK_PCT, UPCOMING_EVENTS_LIMIT, type StaffSeasonDashboard } from "@space/shared";

import { useSeasonStaffDashboard } from "../../hooks/use-dashboard";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useCurrentSeasonId } from "../../hooks/use-seasons";
import { apiErrorMessage } from "../../lib/api-error";
import { formatDayKey, formatWallTime } from "../../lib/format";
import { useTheme } from "../../theme";
import { Card, EmptyState, ErrorState, LoadingState, Text } from "../../ui";
import { DashboardFrame } from "./DashboardFrame";
import { StatTile, TileRow } from "./StatTile";
import { UpcomingEventsCard } from "./UpcomingEventsCard";

function StaffSummary({ data, role }: { data: StaffSeasonDashboard; role: "ADMIN" | "LEADER" }) {
  const theme = useTheme();
  const router = useRouter();
  const isLeader = role === "LEADER";
  const { progress, cohort, submissions, quizzes, nextSession } = data;
  const mean = cohort.meanAttendancePct === null ? "—" : `${cohort.meanAttendancePct}%`;

  return (
    <>
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="title">{data.season.title}</Text>
        {data.groups.length > 0 ? (
          // D7: every group the leader leads in this season, not v1's arbitrary first one.
          <Text variant="label" color={theme.colors.neutral[600]}>
            {data.groups.map((g) => g.name).join(", ")}
          </Text>
        ) : null}
        <Text variant="body">
          {progress.pct === null
            ? "No sessions scheduled yet"
            : `Session ${progress.sessionsHeld} of ${progress.sessionsTotal}`}
        </Text>
        {/* Neutral, no 70/85 colour tiers (D2); "—" when nobody has had a session (D5). */}
        <Text variant="body">{`${isLeader ? "Group average attendance" : "Average attendance"} ${mean}`}</Text>
      </Card>

      <TileRow>
        <StatTile
          label="Students"
          value={String(cohort.studentCount)}
          onPress={() => router.push(isLeader ? "/groups" : "/students")}
        />
        <StatTile
          label="Quizzes pending"
          value={String(quizzes.pending)}
          tone={quizzes.pending > 0 ? "warning" : "neutral"}
          onPress={() => router.push("/quizzes")}
        />
        <StatTile
          label="Pending review"
          value={String(submissions.pendingReview)}
          caption={`${submissions.reviewed} reviewed`}
          onPress={() => router.push("/submissions")}
        />
      </TileRow>

      <Card style={{ marginBottom: theme.spacing.sm }}>
        {nextSession ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Session ${nextSession.title}`}
            onPress={() =>
              router.push({ pathname: "/session/[id]", params: { id: String(nextSession.id) } })
            }
          >
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {nextSession.isInProgress ? "Happening now" : "Next session"}
            </Text>
            <Text variant="heading">{nextSession.title}</Text>
            <Text variant="label" color={theme.colors.neutral[600]}>
              {`${formatDayKey(nextSession.dayKey)} · ${formatWallTime(nextSession.time)}`}
            </Text>
          </Pressable>
        ) : (
          <Text variant="body">No upcoming sessions.</Text>
        )}
      </Card>

      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{isLeader ? "Your students at risk" : "At risk"}</Text>
        {cohort.atRisk.length === 0 ? (
          <EmptyState
            title="Nobody at risk"
            message={`No student has attendance or submissions below ${AT_RISK_PCT}%.`}
          />
        ) : (
          <>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {`${cohort.atRisk.length} of ${cohort.atRiskTotal}`}
            </Text>
            {cohort.atRisk.map((r) => {
              // D4: "N of M submitted" straight from the engagement row — no client subtraction.
              const line = `${r.attendancePct}% attendance, ${r.submissionsCompleted} of ${r.submissionsExpected} submitted`;
              return (
                <Pressable
                  key={`${r.studentUserId}:${r.seasonId}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.studentName}, ${line}`}
                  onPress={() =>
                    router.push({
                      pathname: "/student/[id]",
                      params: { id: String(r.studentUserId) },
                    })
                  }
                  style={{ paddingVertical: theme.spacing.sm }}
                >
                  <Text variant="label" color={theme.colors.error[600]}>
                    {r.studentName}
                  </Text>
                  <Text variant="caption" color={theme.colors.neutral[600]}>
                    {line}
                  </Text>
                </Pressable>
              );
            })}
          </>
        )}
        {/* D6: no full roster on Home — the roster screens already exist. */}
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(isLeader ? "/groups" : "/students")}
        >
          <Text variant="label">View all</Text>
        </Pressable>
      </Card>

      {quizzes.total > 0 || quizzes.drafts > 0 ? (
        <Card style={{ marginBottom: theme.spacing.sm }}>
          <Text variant="heading">Quizzes</Text>
          <Text variant="body">{`${quizzes.fullyGraded} of ${quizzes.total} fully graded`}</Text>
          {quizzes.drafts > 0 ? (
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {`${quizzes.drafts} quiz ${quizzes.drafts === 1 ? "draft" : "drafts"} not yet published`}
            </Text>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

/**
 * ADMIN (season-wide) and LEADER (their groups). The season is
 * `useCurrentSeasonId` — the one staff "current season" rule (X8, D9) — never
 * re-resolved on the server.
 */
export function SeasonStaffDashboard({ role }: { role: "ADMIN" | "LEADER" }) {
  const current = useCurrentSeasonId();
  const dash = useSeasonStaffDashboard(current.seasonId);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);

  const refresh = () => {
    current.refetch();
    if (current.seasonId !== null) void dash.refetch();
    void events.refetch();
  };

  return (
    <DashboardFrame onRefresh={refresh} refreshing={dash.isRefetching || events.isRefetching}>
      {current.isPending ? (
        <LoadingState />
      ) : current.isError ? (
        <ErrorState message="Couldn't load your seasons." onRetry={current.refetch} />
      ) : current.seasonId === null ? (
        <EmptyState title="No season yet" message="There is no season for you to manage yet." />
      ) : dash.isPending ? (
        <LoadingState />
      ) : dash.isError ? (
        <ErrorState
          message={apiErrorMessage(dash.error, "Couldn't load the dashboard.")}
          onRetry={() => void dash.refetch()}
        />
      ) : (
        <StaffSummary data={dash.data} role={role} />
      )}
      <UpcomingEventsCard query={events} />
    </DashboardFrame>
  );
}
