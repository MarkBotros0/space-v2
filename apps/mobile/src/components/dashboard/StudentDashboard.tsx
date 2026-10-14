import { useRouter } from "expo-router";
import { AlertTriangle, Sparkles } from "lucide-react-native";
import { Linking, Pressable, View } from "react-native";
import {
  UPCOMING_EVENTS_LIMIT,
  type DashboardDueItem,
  type StudentDashboard as StudentData,
} from "@space/shared";

import { Eyebrow } from "../../design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { ShellFrame } from "../../design/layout/shell-frame";
import { cn } from "../../design/lib/cn";
import { iconWithClassName } from "../../design/lib/icon";
import { shadowStyle } from "../../design/lib/shadow";
import { StatCard } from "../../design/students/stat-card";
import { Badge, Button, EmptyState, ProgressRing, Text } from "../../design/ui";
import { useStudentDashboard } from "../../hooks/use-dashboard";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useMyAttendance } from "../../hooks/use-self-service";
import {
  firstName,
  formatDistanceOnly,
  formatShortDay,
  formatTimeAgo,
  formatWallTime,
  formatWeekdayDay,
} from "../../lib/format";
import { useSessionStore } from "../../store/session";
import { UpcomingEventsCard } from "./UpcomingEventsCard";

iconWithClassName(AlertTriangle);

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const CARD = "rounded-2xl border border-border bg-card";

function subtitle(data: StudentData | undefined): string {
  if (!data?.season || !data.assignments) return "Welcome to JPC Space";
  const n = data.assignments.outstandingCount;
  // v1 said "all caught up this week" while counting the whole season (R67).
  return n > 0
    ? `${n} ${plural(n, "assignment needs", "assignments need")} your attention.`
    : "You're all caught up.";
}

/** v1's due badge: overdue → "Due Mar 13" (org day, X13); else "Due in 3 days". */
function DueBadge({ a }: { a: DashboardDueItem }) {
  if (a.isOverdue) {
    return (
      <Badge variant="error" className="shrink-0" textClassName="text-[10px]">
        {`Due ${formatShortDay(a.dueOrgDay)}`}
      </Badge>
    );
  }
  if (!a.dueAt) return null;
  return (
    <Badge variant="warning" className="shrink-0" textClassName="text-[10px]">
      {`Due in ${formatDistanceOnly(a.dueAt)}`}
    </Badge>
  );
}

/**
 * v1 app/student/dashboard/page.tsx. Copy kept from v2's rulings: "Session N
 * of M" (spec 19 D12), "Absence budget left" (D14), "Join stream" only while
 * a session runs (D13), events card with an empty state (D19).
 */
export function StudentDashboard() {
  const router = useRouter();
  const name = useSessionStore((s) => s.user?.name ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);

  const dash = useStudentDashboard(activeSeasonId);
  // Domain 4's numbers through domain 4's endpoint and cache (spec 19 §7, D14).
  // Gated on the season inside the hook (Plan 11).
  const attendance = useMyAttendance(activeSeasonId);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);

  const refresh = () => {
    void dash.refetch();
    // `enabled` gates only the automatic run — guard the manual one too.
    if (activeSeasonId !== null) void attendance.refetch();
    void events.refetch();
  };

  const data = dash.data;
  const enrolled = data !== undefined && data.season !== null;

  return (
    <ShellFrame
      onRefresh={refresh}
      refreshing={dash.isRefetching || attendance.isRefetching || events.isRefetching}
    >
      <View className="flex-col gap-3">
        <View>
          <Text accessibilityRole="header" className="text-2xl font-black text-brand-navy-900 dark:text-foreground">
            {`Hi, ${firstName(name)} 👋`}
          </Text>
          <Text className="mt-1 text-sm text-muted-foreground">{subtitle(data)}</Text>
        </View>

        {dash.isPending ? (
          <RouteSkeleton />
        ) : dash.isError ? (
          <RouteError onRetry={() => void dash.refetch()} />
        ) : !enrolled ? (
          <>
            {/* v1 keeps the empty `{season && …}` slot, an extra 12px. */}
            <View />
            <EmptyState
              icon={Sparkles}
              title="Not enrolled yet"
              description="Contact your leader or admin to be enrolled in a season."
            />
            <View className="rounded-2xl border border-brand-teal-200 bg-brand-teal-100 p-4 dark:border-brand-teal-900 dark:bg-brand-teal-950">
              <Eyebrow tone="teal">While you wait</Eyebrow>
              <Pressable accessibilityRole="link" onPress={() => router.push("/profile")}>
                <Text className="mt-1 text-sm font-bold text-brand-teal-900 dark:text-brand-teal-100">
                  Complete your profile →
                </Text>
              </Pressable>
            </View>
            <UpcomingEventsCard query={events} />
          </>
        ) : (
          <EnrolledBody data={data} attendance={attendance} events={events} />
        )}
      </View>
    </ShellFrame>
  );
}

function EnrolledBody({
  data,
  attendance,
  events,
}: {
  data: StudentData;
  attendance: ReturnType<typeof useMyAttendance>;
  events: ReturnType<typeof useUpcomingEvents>;
}) {
  const router = useRouter();
  const progress = data.progress;
  const pct = progress?.pct ?? null;
  const pending = data.assignments?.outstandingCount ?? 0;
  const late = data.assignments?.lateSubmittedCount ?? 0;
  const next = data.nextSession;
  const streak = attendance.data?.streak ?? null;
  const left = progress ? progress.sessionsTotal - progress.sessionsHeld : 0;

  return (
    <>
      {/* v1 keeps the empty `{!season && …}` slot, an extra 12px. */}
      <View />
      {progress && data.season ? (
        <View className={cn(CARD, "p-5")} style={shadowStyle("soft")}>
          <View className="flex-row items-center gap-5">
            <ProgressRing value={pct ?? 0} label={`Season ${pct ?? 0}% complete`}>
              <Text className="text-2xl font-black text-brand-navy-900 dark:text-foreground">{`${pct ?? 0}%`}</Text>
              <Eyebrow className="mt-1">done</Eyebrow>
            </ProgressRing>
            <View className="min-w-0 flex-1">
              <Eyebrow tone="teal">Current season</Eyebrow>
              <Text numberOfLines={1} className="mt-1 text-lg font-black text-brand-navy-900 dark:text-foreground">
                {data.season.title}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {pct === null
                  ? "No sessions scheduled yet"
                  : pct >= 100
                    ? `Session ${progress.sessionsHeld} of ${progress.sessionsTotal} · complete`
                    : `Session ${progress.sessionsHeld} of ${progress.sessionsTotal} · ${left} ${plural(left, "session", "sessions")} to go`}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {attendance.isError ? (
        <View className="flex-col items-start gap-2">
          <Text className="text-sm text-error-600 dark:text-error-400">Couldn't load your attendance.</Text>
          <Button variant="outline" size="sm" onPress={() => void attendance.refetch()}>
            Try again
          </Button>
        </View>
      ) : (
        <View className="flex-row gap-3">
          <StatCard
            label="Absence budget left"
            value={attendance.data?.budget ? `${attendance.data.budget.remainingPct}%` : "—"}
            sublabel="this season"
            onPress={() => router.push("/attendance")}
          />
          <StatCard
            label="Streak"
            value={streak === null ? "—" : String(streak)}
            icon={streak !== null && streak > 0 ? "flame" : undefined}
          />
          <StatCard
            label="Assignments"
            value={String(pending)}
            sublabel="pending"
            variant={pending > 0 ? "teal" : "white"}
            onPress={() => router.push("/assignments")}
          />
        </View>
      )}

      {late > 0 ? (
        <View className="rounded-2xl border border-warning-200 bg-warning-50 p-3 dark:border-warning-900 dark:bg-warning-950">
          <View className="flex-row items-center gap-1.5">
            <AlertTriangle size={14} className="shrink-0 text-warning-800 dark:text-warning-200" />
            <Text className="text-xs font-bold text-warning-800 dark:text-warning-200">
              {`${late} ${plural(late, "assignment", "assignments")} submitted late this season`}
            </Text>
          </View>
        </View>
      ) : null}

      <View className={cn(CARD, "p-4")} style={shadowStyle("soft")}>
        <Eyebrow>{next?.isInProgress ? "Happening now" : "Next session"}</Eyebrow>
        {next ? (
          <View className="mt-2 flex-col gap-2">
            <View className="flex-row items-start gap-3">
              <View className="mt-1 size-2 shrink-0 rounded-full bg-brand-teal-500" />
              <View className="min-w-0 flex-1 items-start">
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.push({ pathname: "/session/[id]", params: { id: String(next.id) } })}
                >
                  <Text className="text-sm font-bold text-brand-navy-900 dark:text-foreground">{next.title}</Text>
                </Pressable>
                <Text className="text-xs text-muted-foreground">
                  {`${formatWeekdayDay(next.dayKey)} · ${formatWallTime(next.time)} · ${next.durationMinutes} min${
                    next.location ? ` · ${next.location}` : ""
                  }`}
                </Text>
                {next.isInProgress ? null : (
                  <Badge variant="teal" className="mt-1.5" textClassName="text-[10px]">
                    {formatTimeAgo(next.startsAt)}
                  </Badge>
                )}
              </View>
            </View>
            {/* D13: a stream link only while the session is running; never "Watch recording" on a future one. */}
            {next.isInProgress && next.youtubeUrl ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(next.youtubeUrl ?? "")}
                className="items-center justify-center rounded-lg bg-brand-teal-600 px-3 py-2 active:bg-brand-teal-700"
              >
                <Text className="text-xs font-bold text-white">Join stream</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Text className="mt-2 text-sm italic text-muted-foreground">No upcoming sessions.</Text>
        )}
      </View>

      <UpcomingEventsCard query={events} />

      {data.assignments && data.assignments.dueSoon.length > 0 ? (
        <View className={cn(CARD, "p-4")} style={shadowStyle("soft")}>
          <View className="flex-row items-center justify-between">
            <Eyebrow>Due soon</Eyebrow>
            <Pressable accessibilityRole="link" onPress={() => router.push("/assignments")}>
              <Text className="text-xs font-semibold text-brand-teal-700 dark:text-brand-teal-300">See all</Text>
            </Pressable>
          </View>
          <View className="mt-2 flex-col">
            {data.assignments.dueSoon.slice(0, 3).map((a, i, rows) => (
              <View
                key={a.id}
                className={cn(
                  "flex-row items-center justify-between gap-3 py-2",
                  i > 0 && "border-t border-border",
                  i === 0 && "pt-0",
                  i === rows.length - 1 && "pb-0",
                )}
              >
                <Pressable
                  accessibilityRole="link"
                  className="min-w-0 flex-1"
                  onPress={() => router.push({ pathname: "/assignment/[id]", params: { id: String(a.id) } })}
                >
                  <Text numberOfLines={1} className="text-sm font-semibold text-brand-navy-900 dark:text-foreground">
                    {a.title}
                  </Text>
                </Pressable>
                <DueBadge a={a} />
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
}
