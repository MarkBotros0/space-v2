/** student-detail's engagement card and its Attendance and Submissions tabs. */
import { useRouter } from "expo-router";
import { Calendar, MapPin } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { isNoSeasonError, useStudentEngagement } from "../../hooks/use-engagement";
import { useStudentAttendanceHistory, useStudentSubmissions } from "../../hooks/use-students";
import { formatDate, formatDateTime } from "../../lib/format";
import { InlineError } from "../layout/route-states";
import { AttendancePill } from "../ui/attendance-pill";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { Progress } from "../ui/progress";
import { SubmissionStatusBadge } from "../ui/submission-status-badge";
import { Text } from "../ui/text";

export function Loading() {
  return <Text className="py-4 text-center text-sm text-muted-foreground">Loading…</Text>;
}

export function EngagementCard({ studentId }: { studentId: number }) {
  const q = useStudentEngagement(studentId, true);
  // v1 renders the card only when the student has a current season (404 no_season = no card).
  if (q.isPending || (q.isError && isNoSeasonError(q.error))) return null;
  if (q.isError)
    return <InlineError message="Couldn't load engagement." onRetry={() => void q.refetch()} />;
  const e = q.data;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="min-w-0 flex-1 text-base">Engagement (current season)</CardTitle>
        {/* V2-ONLY: the single at-risk definition (C4). */}
        {e.atRisk ? (
          <Badge variant="error" className="shrink-0">
            At risk
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="flex-col gap-3">
        <View className="flex-row items-center gap-3">
          <Progress value={e.score} className="flex-1" />
          <Text className="text-sm font-semibold">{`${e.score}%`}</Text>
        </View>
        <View className="flex-row gap-3">
          <Text className="flex-1 text-xs text-muted-foreground">
            {`Attendance: ${e.attendancePresent}/${e.attendanceTotal} (${e.attendancePct}%)`}
          </Text>
          <Text className="flex-1 text-xs text-muted-foreground">
            {`Submissions: ${e.submissionsCompleted}/${e.submissionsExpected} (${e.submissionPct}%)`}
          </Text>
        </View>
      </CardContent>
    </Card>
  );
}

export function AttendanceTab({ studentId }: { studentId: number }) {
  const q = useStudentAttendanceHistory(studentId, true);
  if (q.isPending) return <Loading />;
  if (q.isError)
    return <InlineError message="Couldn't load attendance." onRetry={() => void q.refetch()} />;
  if (q.data.history.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title="No attendance yet"
        description="Attendance records will appear here as sessions are marked."
      />
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        {q.data.history.map((r, i) => (
          <View
            key={r.sessionId}
            className={`flex-row items-center justify-between gap-3 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}
          >
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-sm font-medium">
                {r.sessionTitle}
              </Text>
              {/* Instant in the device zone: no org day on this row (X13, gap note). */}
              <Text className="text-xs text-muted-foreground">{`${formatDateTime(r.startsAt)} · ${r.seasonTitle}`}</Text>
            </View>
            <AttendancePill status={r.status} />
          </View>
        ))}
      </CardContent>
    </Card>
  );
}

export function SubmissionsTab({ studentId }: { studentId: number }) {
  const router = useRouter();
  const q = useStudentSubmissions(studentId, true);
  if (q.isPending) return <Loading />;
  if (q.isError)
    return <InlineError message="Couldn't load submissions." onRetry={() => void q.refetch()} />;
  if (q.data.submissions.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No submissions"
        description="Submissions visible to you will appear here."
      />
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        {q.data.submissions.map((s, i) => (
          <View
            key={s.publicId}
            className={`flex-row items-center justify-between gap-3 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}
          >
            <View className="min-w-0 flex-1">
              <Pressable
                accessibilityRole="link"
                className="self-start"
                onPress={() =>
                  router.push({
                    pathname: "/submission/[publicId]",
                    params: { publicId: s.publicId },
                  })
                }
              >
                <Text numberOfLines={1} className="text-sm font-medium">
                  {s.assignmentTitle}
                </Text>
              </Pressable>
              <Text className="text-xs text-muted-foreground">
                {`${s.seasonTitle}${s.submittedAt ? ` · submitted ${formatDate(s.submittedAt)}` : ""}`}
              </Text>
            </View>
            <View className="shrink-0 flex-row items-center gap-1.5">
              {s.isLate ? <Badge variant="warning">Late</Badge> : null}
              <SubmissionStatusBadge status={s.status} />
            </View>
          </View>
        ))}
      </CardContent>
    </Card>
  );
}
