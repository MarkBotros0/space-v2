import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { AT_RISK_PCT, UPCOMING_EVENTS_LIMIT, type ActivityItem } from "@space/shared";

import { useMentorDashboard } from "../../hooks/use-dashboard";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useEngagementReport } from "../../hooks/use-reports";
import { formatTimeAgo } from "../../lib/format";
import { useTheme } from "../../theme";
import { Card, EmptyState, ErrorState, LoadingState, Text } from "../../ui";
import { DashboardFrame } from "./DashboardFrame";
import { UpcomingEventsCard } from "./UpcomingEventsCard";

function activityLine(i: ActivityItem): string {
  if (i.kind === "attendance") {
    return `${i.studentName} was ${(i.attendanceStatus ?? "marked").toLowerCase()} at ${i.subjectTitle}`;
  }
  if (i.kind === "submitted") return `${i.studentName} submitted ${i.subjectTitle}`;
  return `${i.studentName} received feedback on ${i.subjectTitle}`;
}

export function MentorDashboard() {
  const theme = useTheme();
  const router = useRouter();
  // D17: the SAME query key as the mentor's Reports tab, so Home and Reports
  // cannot show different at-risk sets. No seasonId = the mentor's whole scope.
  const engagement = useEngagementReport(null, true);
  const feed = useMentorDashboard();
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);

  const refresh = () => {
    void engagement.refetch();
    void feed.refetch();
    void events.refetch();
  };

  const open = (i: ActivityItem) => {
    // D18 / R55: v2 has no role prefix to forbid these links.
    if (i.submissionPublicId !== null) {
      router.push({
        pathname: "/submission/[publicId]",
        params: { publicId: i.submissionPublicId },
      });
    } else {
      router.push({ pathname: "/student/[id]", params: { id: String(i.studentUserId) } });
    }
  };

  return (
    <DashboardFrame
      onRefresh={refresh}
      refreshing={engagement.isRefetching || feed.isRefetching || events.isRefetching}
    >
      <Card style={{ marginBottom: theme.spacing.sm }}>
        {/* "At risk", not v1's "Flagged for follow-up" — that phrase belongs to notes (R48). */}
        <Text variant="heading">At risk</Text>
        {engagement.isPending ? (
          <LoadingState />
        ) : engagement.isError ? (
          <ErrorState
            message="Couldn't load the at-risk list."
            onRetry={() => void engagement.refetch()}
          />
        ) : engagement.data.atRisk.length === 0 ? (
          <EmptyState
            title="Nobody at risk"
            message={`No student has attendance or submissions below ${AT_RISK_PCT}%.`}
          />
        ) : (
          <>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {`${engagement.data.atRisk.length} of ${engagement.data.atRiskTotal}`}
            </Text>
            {engagement.data.atRisk.map((r) => (
              <Pressable
                key={`${r.studentUserId}:${r.seasonId}`}
                accessibilityRole="button"
                accessibilityLabel={`${r.name}, ${r.seasonTitle}, ${r.attendancePct}% attendance, ${r.submissionPct}% submissions`}
                onPress={() =>
                  router.push({
                    pathname: "/student/[id]",
                    params: { id: String(r.studentUserId) },
                  })
                }
                style={{ paddingVertical: theme.spacing.sm }}
              >
                <Text variant="label">{r.name}</Text>
                <Text variant="caption" color={theme.colors.neutral[600]}>
                  {`${r.seasonTitle} · ${r.attendancePct}% attendance · ${r.submissionPct}% submissions`}
                </Text>
              </Pressable>
            ))}
          </>
        )}
      </Card>

      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">Recent activity</Text>
        {feed.isPending ? (
          <LoadingState />
        ) : feed.isError ? (
          <ErrorState
            message="Couldn't load recent activity."
            onRetry={() => void feed.refetch()}
          />
        ) : feed.data.recentActivity.length === 0 ? (
          <Text variant="body">No recent activity.</Text>
        ) : (
          feed.data.recentActivity.map((i) => (
            <Pressable
              key={i.key}
              accessibilityRole="button"
              accessibilityLabel={activityLine(i)}
              onPress={() => open(i)}
              style={{ paddingVertical: theme.spacing.sm }}
            >
              <Text variant="label">{activityLine(i)}</Text>
              <Text variant="caption" color={theme.colors.neutral[600]}>
                {formatTimeAgo(i.at)}
              </Text>
            </Pressable>
          ))
        )}
      </Card>

      {/* No quick links: in v2 they are tabs (spec 19 §9). */}
      <UpcomingEventsCard query={events} />
    </DashboardFrame>
  );
}
