import { useRouter } from "expo-router";
import { AlertCircle, Sparkles, Users } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { AT_RISK_PCT, UPCOMING_EVENTS_LIMIT, type ActivityItem } from "@space/shared";

import { PageTitle } from "../../design/layout/page-title";
import { ShellFrame } from "../../design/layout/shell-frame";
import { iconWithClassName } from "../../design/lib/icon";
import { shadowStyle } from "../../design/lib/shadow";
import { Badge, Button, EmptyState, Skeleton, Text } from "../../design/ui";
import { useMentorDashboard } from "../../hooks/use-dashboard";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useEngagementReport } from "../../hooks/use-reports";
import { formatTimeAgo } from "../../lib/format";
import { UpcomingEventsCard } from "./UpcomingEventsCard";

iconWithClassName(AlertCircle);
iconWithClassName(Users);

function activityParts(i: ActivityItem): { name: string; rest: string } {
  if (i.kind === "attendance") {
    return {
      name: i.studentName,
      rest: ` was ${(i.attendanceStatus ?? "marked").toLowerCase()} at ${i.subjectTitle}`,
    };
  }
  if (i.kind === "submitted") return { name: i.studentName, rest: ` submitted ${i.subjectTitle}` };
  return { name: i.studentName, rest: ` received feedback on ${i.subjectTitle}` };
}

/** v1's `CardHeader` + `CardTitle` row: a coloured icon beside the title (and an optional ghost link). */
function CardTitleRow({
  icon,
  title,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between gap-2 p-4">
      <View className="flex-row items-center gap-2">
        {icon}
        <Text accessibilityRole="header" className="text-base font-semibold">
          {title}
        </Text>
      </View>
      {action}
    </View>
  );
}

function CardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="flex-col items-start gap-2 px-4 pb-4">
      <Text className="text-sm text-error-600 dark:text-error-400">{message}</Text>
      <Button variant="outline" size="sm" onPress={onRetry}>
        Try again
      </Button>
    </View>
  );
}

function CardLoading() {
  return (
    <View accessible accessibilityLabel="Loading" className="flex-col gap-2.5 px-4 pb-4">
      <Skeleton className="h-9 rounded-lg" />
      <Skeleton className="h-9 rounded-lg" />
    </View>
  );
}

/**
 * v1 app/mentor/dashboard/page.tsx: title and subtitle, the upcoming-events
 * card, then "Flagged for follow-up" and "Recent activity". v2 keeps its
 * decisions (B6-1): "At risk" is the label (R48), the list shares Reports'
 * cache (D17), and the quick-link tiles are tabs here (spec 19 §9).
 */
export function MentorDashboard() {
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
    <ShellFrame
      onRefresh={refresh}
      refreshing={engagement.isRefetching || feed.isRefetching || events.isRefetching}
    >
      <View className="flex-col gap-4">
        <PageTitle
          title="Mentor dashboard"
          subtitle="Cross-season pastoral view. You can read everything; writes are limited to your notes."
        />

        <UpcomingEventsCard query={events} />

        <View className="rounded-2xl border border-border bg-card" style={shadowStyle("soft")}>
          <CardTitleRow
            icon={<AlertCircle size={16} className="text-warning-600" />}
            title="At risk"
            action={
              <Button variant="ghost" size="sm" onPress={() => router.push("/students")}>
                All students
              </Button>
            }
          />
          {engagement.isPending ? (
            <CardLoading />
          ) : engagement.isError ? (
            <CardError
              message="Couldn't load the at-risk list."
              onRetry={() => void engagement.refetch()}
            />
          ) : engagement.data.atRisk.length === 0 ? (
            <View className="px-4 pb-4">
              <EmptyState
                icon={Sparkles}
                title="Nobody at risk"
                description={`No student has attendance or submissions below ${AT_RISK_PCT}%.`}
              />
            </View>
          ) : (
            <View className="px-4 pb-4">
              <Text className="mb-1 text-xs text-muted-foreground">
                {`${engagement.data.atRisk.length} of ${engagement.data.atRiskTotal}`}
              </Text>
              {engagement.data.atRisk.map((r, idx) => (
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
                  className={`flex-row items-center justify-between gap-2 py-2 active:opacity-80 ${
                    idx > 0 ? "border-t border-neutral-100 dark:border-border" : "pt-0"
                  }`}
                >
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-sm font-medium">
                      {r.name}
                    </Text>
                    <Text numberOfLines={1} className="text-xs text-muted-foreground">
                      {r.seasonTitle}
                    </Text>
                  </View>
                  <View className="shrink-0 flex-row gap-1">
                    <Badge variant="warning">{`${r.attendancePct}% att.`}</Badge>
                    <Badge variant="error">{`${r.submissionPct}% sub.`}</Badge>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View className="rounded-2xl border border-border bg-card" style={shadowStyle("soft")}>
          <CardTitleRow
            icon={<Users size={16} className="text-info-600" />}
            title="Recent activity"
          />
          {feed.isPending ? (
            <CardLoading />
          ) : feed.isError ? (
            <CardError
              message="Couldn't load recent activity."
              onRetry={() => void feed.refetch()}
            />
          ) : feed.data.recentActivity.length === 0 ? (
            <Text className="px-4 pb-4 pt-0 text-center text-sm italic text-muted-foreground">
              No recent activity.
            </Text>
          ) : (
            <View className="px-4 pb-4">
              {feed.data.recentActivity.map((i, idx) => {
                const { name, rest } = activityParts(i);
                return (
                  <Pressable
                    key={i.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${name}${rest}`}
                    onPress={() => open(i)}
                    className={`flex-row items-start justify-between gap-3 py-2 active:opacity-80 ${
                      idx > 0 ? "border-t border-neutral-100 dark:border-border" : "pt-0"
                    }`}
                  >
                    <Text className="min-w-0 flex-1 text-sm">
                      <Text className="text-sm font-medium">{name}</Text>
                      <Text className="text-sm text-muted-foreground">{rest}</Text>
                    </Text>
                    <Text className="shrink-0 text-xs text-muted-foreground">
                      {formatTimeAgo(i.at)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </View>
    </ShellFrame>
  );
}
