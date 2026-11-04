import { MapPin } from "lucide-react-native";
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { SessionDetail } from "@space/shared";

import { PageTitle } from "../../design/layout/page-title";
import { ShellFrame } from "../../design/layout/shell-frame";
import { iconWithClassName } from "../../design/lib/icon";
import {
  Badge,
  Button as ButtonV1,
  Card as CardV1,
  CardContent,
  Text as TextV1,
} from "../../design/ui";
import { formatDayKey, formatWallTime, formatWeekdayDay } from "../../lib/format";
import { attendanceLine } from "./attendance-line";
import { CheckInConsoleCard, LeaderCheckInCard } from "./check-in-cards";
import { AdminQuizzesCard, LeaderQuizzesCard } from "./quizzes-cards";
import { LeaderVideoResults, VideoSection } from "./video-sections";

iconWithClassName(MapPin);

interface BodyProps {
  data: SessionDetail;
  refetch: () => void;
  isRefetching: boolean;
}

/** LEADER — v1 app/leader/sessions/[id]/page.tsx (B3-13). */
export function LeaderSessionBody({ data, refetch, isRefetching }: BodyProps) {
  const router = useRouter();
  return (
    <ShellFrame refreshing={isRefetching} onRefresh={refetch}>
      <View className="flex-col gap-4">
        {/* Org day and wall time from the server (X13). */}
        <PageTitle
          title={data.title}
          subtitle={`${formatWeekdayDay(data.dayKey)} · ${formatWallTime(data.startTime)}`}
        />
        {/* V2-ONLY entry: v1 leaders had no link to their attendance page; v1 admin's button. */}
        {data.canMarkAttendance ? (
          <ButtonV1
            className="self-start"
            onPress={() =>
              router.push({ pathname: "/session/[id]/attendance", params: { id: String(data.id) } })
            }
          >
            Mark attendance
          </ButtonV1>
        ) : null}
        {data.canMarkAttendance ? <LeaderQuizzesCard sessionId={data.id} /> : null}
        {data.canMarkAttendance ? <LeaderCheckInCard detail={data} /> : null}
        {data.youtubeUrl !== null ? <LeaderVideoResults sessionId={data.id} /> : null}
      </View>
    </ShellFrame>
  );
}

/**
 * ADMIN / SUPER / MENTOR — v1 app/admin/season/[code]/sessions/[id]/page.tsx:
 * title and when, Edit + Mark attendance, the info card, Quizzes, Video
 * questions, Check-in. A MENTOR reads the info card only (no attendance,
 * no edit: the server's flags).
 */
export function AdminSessionBody({
  data,
  showConsole,
  refetch,
  isRefetching,
}: BodyProps & { showConsole: boolean }) {
  const router = useRouter();
  return (
    <ShellFrame refreshing={isRefetching} onRefresh={refetch}>
      <View className="flex-col gap-4">
        {/* Org day and wall time from the server (X13) — the device zone never re-reads startsAt. */}
        <PageTitle
          title={data.title}
          subtitle={`${formatDayKey(data.dayKey)} · ${formatWallTime(data.startTime)} · ${data.durationMinutes} min`}
        />
        {data.canManageCheckIn || data.canMarkAttendance ? (
          <View className="flex-row flex-wrap gap-2">
            {data.canManageCheckIn ? (
              <ButtonV1
                variant="outline"
                onPress={() =>
                  router.push({ pathname: "/session/[id]/edit", params: { id: String(data.id) } })
                }
              >
                Edit
              </ButtonV1>
            ) : null}
            {data.canMarkAttendance ? (
              <ButtonV1
                onPress={() =>
                  router.push({
                    pathname: "/session/[id]/attendance",
                    params: { id: String(data.id) },
                  })
                }
              >
                Mark attendance
              </ButtonV1>
            ) : null}
          </View>
        ) : null}

        {data.recurrenceGroupId || data.location || data.description || data.myAttendance ? (
          <CardV1>
            <CardContent className="flex-col gap-3 pt-6">
              {data.recurrenceGroupId ? (
                <Badge variant="outline" className="self-start">
                  Part of a recurring series
                </Badge>
              ) : null}
              {data.location ? (
                <View className="flex-row items-center gap-1.5">
                  <MapPin size={16} className="text-muted-foreground" />
                  <TextV1 className="text-sm">{data.location}</TextV1>
                </View>
              ) : null}
              {data.description ? (
                <TextV1 className="text-sm text-foreground">{data.description}</TextV1>
              ) : null}
              {data.myAttendance ? (
                <TextV1 className="text-sm text-muted-foreground">
                  {attendanceLine(data.myAttendance)}
                </TextV1>
              ) : null}
            </CardContent>
          </CardV1>
        ) : null}

        {data.canMarkAttendance ? (
          <AdminQuizzesCard sessionId={data.id} seasonId={data.seasonId} canAuthor={showConsole} />
        ) : null}

        <VideoSection detail={data} />

        {showConsole ? (
          <CheckInConsoleCard detail={data} />
        ) : data.canMarkAttendance ? (
          <LeaderCheckInCard detail={data} />
        ) : null}
      </View>
    </ShellFrame>
  );
}
