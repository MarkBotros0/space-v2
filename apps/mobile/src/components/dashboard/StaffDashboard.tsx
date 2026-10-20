import { useRouter } from "expo-router";
import { AlertTriangle, ClipboardList, PenLine, Users } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { AT_RISK_PCT, UPCOMING_EVENTS_LIMIT, type StaffSeasonDashboard } from "@space/shared";

import { FigurePair, SectionCard } from "../../design/dashboard/section-card";
import { Eyebrow } from "../../design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { ShellFrame } from "../../design/layout/shell-frame";
import { iconWithClassName } from "../../design/lib/icon";
import { shadowStyle } from "../../design/lib/shadow";
import { NextSessionCard } from "../../design/sessions/next-session-card";
import { StatCard } from "../../design/students/stat-card";
import { Badge, EmptyState, ProgressRing, Text } from "../../design/ui";
import { useSeasonStaffDashboard } from "../../hooks/use-dashboard";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useCurrentSeasonId } from "../../hooks/use-seasons";
import { UpcomingEventsCard } from "./UpcomingEventsCard";

iconWithClassName(AlertTriangle);

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const NAVY = "text-brand-navy-900 dark:text-foreground";
const COLUMN = "text-[10px] font-bold uppercase tracking-widest text-muted-foreground";

type Variant = "ADMIN" | "LEADER";

/**
 * v1 app/leader/dashboard/page.tsx (B3-4) and app/admin/dashboard/page.tsx
 * (B4-1) share one body; the variant switches the hero, the order, the
 * destinations and the card titles. v2 decisions kept: neutral
 * ring and no 70/85 tiers (spec 19 D2), "—" before anyone has had a session
 * (D5), the at-risk preview instead of the full roster (D6) with "N/M
 * submitted" instead of a pending count (D4), every led group named (D7),
 * "Session" not "Week" (D12), the stream link only while live (D13).
 */
function StaffSummary({
  data,
  events,
  variant,
}: {
  data: StaffSeasonDashboard;
  events: ReturnType<typeof useUpcomingEvents>;
  variant: Variant;
}) {
  const isAdmin = variant === "ADMIN";
  const studentsHref = isAdmin ? "/students" : "/groups";
  const assignmentsHref = isAdmin ? "/assignments" : "/submissions";
  const router = useRouter();
  const { progress, cohort, submissions, quizzes } = data;
  const mean = cohort.meanAttendancePct;
  const n = cohort.studentCount;
  const groupNames = data.groups.map((g) => g.name).join(", ");

  return (
    <>
      <View className="rounded-2xl border border-border bg-card p-5" style={shadowStyle("soft")}>
        <View className="flex-row items-center gap-5">
          <ProgressRing
            value={mean ?? 0}
            label={
              mean !== null
                ? `${isAdmin ? "Season" : "Group"} average attendance ${mean}%`
                : "No attendance yet"
            }
          >
            <Text className={`text-2xl font-black ${NAVY}`}>
              {mean !== null ? `${mean}%` : "—"}
            </Text>
            <Eyebrow className="mt-1">attendance</Eyebrow>
          </ProgressRing>
          <View className="min-w-0 flex-1">
            <Eyebrow tone="teal">{isAdmin ? "Current season" : data.season.title}</Eyebrow>
            <Text numberOfLines={1} className={`mt-1 text-lg font-black ${NAVY}`}>
              {isAdmin ? data.season.title : groupNames || "Your group"}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {`${n} ${plural(n, "student", "students")}${
                progress.sessionsTotal > 0
                  ? ` · Session ${progress.sessionsHeld} of ${progress.sessionsTotal}`
                  : ""
              }`}
            </Text>
          </View>
        </View>
      </View>

      {isAdmin ? <UpcomingEventsCard query={events} /> : null}

      <View className="flex-row gap-3">
        <StatCard label="Students" value={String(n)} onPress={() => router.push(studentsHref)} />
        <StatCard
          label="Progress"
          value={`${progress.pct ?? 0}%`}
          sublabel={`Session ${progress.sessionsHeld}/${progress.sessionsTotal}`}
        />
        <StatCard
          label="Quizzes"
          value={String(quizzes.pending)}
          sublabel="pending"
          variant={quizzes.total > 0 && quizzes.pending > 0 ? "teal" : "white"}
          onPress={() => router.push("/quizzes")}
        />
      </View>

      <NextSessionCard
        session={data.nextSession}
        onOpen={(id) => router.push({ pathname: "/session/[id]", params: { id: String(id) } })}
      />

      {isAdmin ? null : <UpcomingEventsCard query={events} />}

      <SectionCard
        icon={Users}
        title={isAdmin ? "Students at risk" : "Your students at risk"}
        onViewAll={() => router.push(studentsHref)}
      >
        {cohort.atRisk.length === 0 ? (
          <View className="px-4 py-6">
            <EmptyState
              icon={Users}
              title="Nobody at risk"
              description={`No student has attendance or submissions below ${AT_RISK_PCT}%.`}
            />
          </View>
        ) : (
          <>
            <View className="flex-row gap-3 border-b border-border px-4 py-2">
              <Text className={`flex-1 ${COLUMN}`}>Student</Text>
              <Text className={COLUMN}>Attendance</Text>
              <Text className={COLUMN}>Assignments</Text>
            </View>
            {cohort.atRisk.map((r, i) => (
              <Pressable
                key={`${r.studentUserId}:${r.seasonId}`}
                accessibilityRole="link"
                onPress={() =>
                  router.push({
                    pathname: "/student/[id]",
                    params: { id: String(r.studentUserId) },
                  })
                }
                className={`flex-row items-center gap-3 px-4 py-3 active:bg-muted/40 ${i > 0 ? "border-t border-border" : ""}`}
              >
                <Text numberOfLines={1} className={`flex-1 text-sm font-semibold ${NAVY}`}>
                  {r.studentName}
                </Text>
                <View className="shrink-0 flex-row items-center gap-2">
                  {r.attendanceTotal > 0 ? (
                    <Text className="text-xs font-bold text-error-600 dark:text-error-400">{`${r.attendancePct}%`}</Text>
                  ) : null}
                  <Badge variant="warning" textClassName="text-[10px]">
                    {`${r.submissionsCompleted}/${r.submissionsExpected} submitted`}
                  </Badge>
                </View>
              </Pressable>
            ))}
          </>
        )}
      </SectionCard>

      <SectionCard
        icon={ClipboardList}
        title="Assignments"
        onViewAll={() => router.push(assignmentsHref)}
      >
        <FigurePair
          items={[
            {
              label: "Pending review",
              value: submissions.pendingReview,
              accent:
                submissions.pendingReview > 0 ? "text-warning-700 dark:text-warning-300" : NAVY,
            },
            {
              label: "Reviewed",
              value: submissions.reviewed,
              accent: "text-success-700 dark:text-success-300",
            },
          ]}
        />
      </SectionCard>

      {quizzes.total > 0 || quizzes.drafts > 0 ? (
        <SectionCard
          icon={PenLine}
          title={isAdmin ? "Quizzes" : "Quiz corrections"}
          onViewAll={() => router.push("/quizzes")}
        >
          <FigurePair
            items={[
              {
                label: "Pending",
                value: quizzes.pending,
                accent: quizzes.pending > 0 ? "text-warning-700 dark:text-warning-300" : NAVY,
              },
              {
                label: "Fully graded",
                value: quizzes.fullyGraded,
                accent: "text-success-700 dark:text-success-300",
              },
            ]}
          />
          {quizzes.drafts > 0 ? (
            <Text className="px-4 pb-3 text-xs text-muted-foreground">
              {`${quizzes.drafts} quiz ${plural(quizzes.drafts, "draft", "drafts")} not yet published`}
            </Text>
          ) : null}
        </SectionCard>
      ) : null}

      {cohort.atRiskTotal > 0 ? (
        <View className="flex-row items-start gap-3 rounded-2xl border border-error-200 bg-error-50 p-4 dark:border-error-900 dark:bg-error-950">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-error-500" />
          <View className="min-w-0 flex-1">
            <Text className="text-xs font-bold text-error-800 dark:text-error-200">
              {`${cohort.atRiskTotal} ${plural(cohort.atRiskTotal, "student", "students")} at risk`}
            </Text>
            <Text className="mt-0.5 text-xs text-error-600 dark:text-error-300">
              {cohort.atRisk.map((r) => r.studentName).join(", ")}
            </Text>
          </View>
        </View>
      ) : null}
    </>
  );
}

/** Home for ADMIN (the season) and LEADER (their groups) in the current staff season (X8, D9). */
function StaffDashboard({ variant }: { variant: Variant }) {
  const current = useCurrentSeasonId();
  const dash = useSeasonStaffDashboard(current.seasonId);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);

  const refresh = () => {
    current.refetch();
    if (current.seasonId !== null) void dash.refetch();
    void events.refetch();
  };

  const noSeason = !current.isPending && !current.isError && current.seasonId === null;
  const body = current.isPending ? (
    <RouteSkeleton />
  ) : current.isError ? (
    <RouteError onRetry={current.refetch} />
  ) : current.seasonId === null ? (
    <EmptyState title="No season yet" description="There is no season for you to manage yet." />
  ) : dash.isPending ? (
    <RouteSkeleton />
  ) : dash.isError ? (
    <RouteError onRetry={() => void dash.refetch()} />
  ) : null;

  return (
    <ShellFrame refreshing={dash.isRefetching || events.isRefetching} onRefresh={refresh}>
      <View className="flex-col gap-4">
        {body ??
          (dash.data ? <StaffSummary data={dash.data} events={events} variant={variant} /> : null)}
        {/* V2-ONLY no-season branch keeps the events card (D19). */}
        {noSeason ? <UpcomingEventsCard query={events} /> : null}
      </View>
    </ShellFrame>
  );
}

export const AdminDashboard = () => <StaffDashboard variant="ADMIN" />;
export const LeaderDashboard = () => <StaffDashboard variant="LEADER" />;
