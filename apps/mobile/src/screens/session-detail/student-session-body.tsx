import { CheckCheck, Clock, MapPin } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { SessionDetail } from "@space/shared";

import { StudentCheckInCard } from "../../components/check-in/StudentCheckInCard";
import { VideoQuizPlayer, WatchRecordingButton } from "../../components/VideoQuizPlayer";
import { BackLink, Eyebrow, PageTitle } from "../../design/layout/page-title";
import { InlineError, RouteSkeleton } from "../../design/layout/route-states";
import { ShellFrame } from "../../design/layout/shell-frame";
import { iconWithClassName } from "../../design/lib/icon";
import { shadowStyle } from "../../design/lib/shadow";
import { Badge, Text as TextV1 } from "../../design/ui";
import { useStudentVideoQuiz } from "../../hooks/use-video-quiz";
import { addMinutesToWallTime, formatLongDayYear, formatWallTime } from "../../lib/format";
import { attendanceLine } from "./attendance-line";

iconWithClassName(CheckCheck, Clock, MapPin);

/** v1 app/student/sessions/[id]/page.tsx + the v2 extras kept by B2-14. */
export function StudentSessionBody({
  data,
  refetch,
  isRefetching,
}: {
  data: SessionDetail;
  refetch: () => void;
  isRefetching: boolean;
}) {
  const router = useRouter();
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

  return (
    <ShellFrame onRefresh={refetch} refreshing={isRefetching}>
      <View className="flex-col gap-3">
        <View>
          <BackLink label="Calendar" onPress={() => router.back()} />
          <View
            className="mt-2 rounded-2xl border border-border bg-card p-5"
            style={shadowStyle("soft")}
          >
            <View className="mb-2 flex-row items-center gap-2">
              <Badge variant={hasVideo ? "teal" : "outline"}>
                {hasVideo ? "Online" : "In-person"}
              </Badge>
            </View>
            <PageTitle title={data.title} size="detail" />
            <TextV1 className="mt-1 text-sm text-muted-foreground">
              {formatLongDayYear(data.dayKey)}
            </TextV1>
          </View>
        </View>

        {video}

        <View className="rounded-2xl border border-border bg-card p-4" style={shadowStyle("soft")}>
          <Eyebrow>Details</Eyebrow>
          <View className="mt-2 flex-col gap-2">
            <View className="flex-row items-center gap-2">
              <Clock size={16} className="shrink-0 text-brand-teal-600" />
              <TextV1 className="text-sm text-muted-foreground">
                {`${formatWallTime(data.startTime)} – ${formatWallTime(end)} · ${data.durationMinutes} min`}
              </TextV1>
            </View>
            {data.location ? (
              <View className="flex-row items-center gap-2">
                <MapPin size={16} className="shrink-0 text-brand-teal-600" />
                <TextV1 className="text-sm text-muted-foreground">{data.location}</TextV1>
              </View>
            ) : null}
            {data.myAttendance ? (
              <View className="flex-row items-center gap-2">
                <CheckCheck size={16} className="shrink-0 text-brand-teal-600" />
                <TextV1 className="text-sm text-muted-foreground">
                  {attendanceLine(data.myAttendance)}
                </TextV1>
              </View>
            ) : null}
          </View>
        </View>

        {data.description ? (
          <View
            className="rounded-2xl border border-border bg-card p-4"
            style={shadowStyle("soft")}
          >
            <Eyebrow className="mb-2">About</Eyebrow>
            <TextV1 className="text-sm text-foreground/90">{data.description}</TextV1>
          </View>
        ) : null}

        {/* Spec 04 §9 row 3: students get the check-in action (Plan 11, G2). */}
        <StudentCheckInCard detail={data} />
      </View>
    </ShellFrame>
  );
}
