import type { ReactNode } from "react";
import { View } from "react-native";
import type { SessionDetail } from "@space/shared";

import { StudentCheckInCard } from "../../components/check-in/StudentCheckInCard";
import { VideoQuizPlayer, WatchRecordingButton } from "../../components/VideoQuizPlayer";
import { InlineError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { GroupedList, ListRow, StatusChip, Text, statusChip } from "../../design/ui";
import { usePullRefresh } from "../../hooks/use-pull-refresh";
import { useStudentVideoQuiz } from "../../hooks/use-video-quiz";
import { addMinutesToWallTime, formatLongDayYear, formatWallTime, formatMinutes } from "../../lib/format";
import { attendanceLine } from "./attendance-line";

/** v1 app/student/sessions/[id]/page.tsx + the v2 extras kept by B2-14. */
export function StudentSessionBody({
  data,
  refetch,
}: {
  data: SessionDetail;
  refetch: () => Promise<unknown>;
}) {
  // The check-in card polls this query, so `isRefetching` isn't the student's pull.
  const pull = usePullRefresh(refetch);
  const hasVideo = data.youtubeUrl !== null;
  const quiz = useStudentVideoQuiz(data.id, hasVideo);
  // Org wall times from the server (X13); the end is text arithmetic on the org clock.
  const end = addMinutesToWallTime(data.startTime, data.durationMinutes);

  let video: ReactNode = null;
  if (hasVideo) {
    if (quiz.isPending) video = <RouteSkeleton />;
    else if (quiz.isError)
      video = (
        <InlineError message="Couldn't load the video quiz." onRetry={() => void quiz.refetch()} />
      );
    else if (quiz.data.questions.length === 0 && data.youtubeUrl !== null)
      video = <WatchRecordingButton youtubeUrl={data.youtubeUrl} />;
    else
      video = (
        <VideoQuizPlayer sessionId={data.id} quiz={quiz.data} onRetry={() => void quiz.refetch()} />
      );
  }

  const att = data.myAttendance;
  return (
    <Screen
      title={data.title}
      subtitle={formatLongDayYear(data.dayKey)}
      onRefresh={pull.onRefresh}
      refreshing={pull.refreshing}
    >
      <View className="flex-col gap-4">
        <StatusChip tone={hasVideo ? "info" : "neutral"} label={hasVideo ? "Online" : "In-person"} />

        {/* Spec 04 §9 row 3: students get the check-in action (Plan 11, G2); R33: first, no extra box. */}
        <StudentCheckInCard detail={data} />

        {video}

        <GroupedList header="Details">
          <ListRow
            title="Time"
            subtitle={`${formatWallTime(data.startTime)} – ${formatWallTime(end)} · ${formatMinutes(data.durationMinutes)}`}
            subtitleLines={3}
          />
          {data.location ? (
            <ListRow title="Location" subtitle={data.location} subtitleLines={4} />
          ) : null}
          {att ? (
            <ListRow
              title="Attendance"
              subtitle={att.lateMinutes !== null ? attendanceLine(att) : undefined}
              subtitleLines={3}
              trailing={<StatusChip {...statusChip("attendance", att.status)} />}
            />
          ) : null}
        </GroupedList>

        {data.description ? (
          <GroupedList header="About">
            <View className="px-4 py-3">
              <Text variant="subhead">{data.description}</Text>
            </View>
          </GroupedList>
        ) : null}
      </View>
    </Screen>
  );
}
