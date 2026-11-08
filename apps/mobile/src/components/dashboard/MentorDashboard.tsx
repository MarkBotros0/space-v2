import { useRouter } from "expo-router";
import { Flag, NotebookPen, UserX, Users } from "lucide-react-native";
import { View } from "react-native";
import { UPCOMING_EVENTS_LIMIT } from "@space/shared";

import { InlineError } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { CountTile } from "../../design/home/count-tile";
import { FigureTile } from "../../design/home/figure-tile";
import { GroupedList, Skeleton } from "../../design/ui";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useMentorSummary } from "../../hooks/use-follow-ups";
import { useVisibleNotes } from "../../hooks/use-notes";
import { firstName } from "../../lib/format";
import { RecentNotesGroup } from "../../screens/mentor/recent-notes-group";
import { useSessionStore } from "../../store/session";
import { AnnouncementsHomeCard } from "../../screens/announcements/announcements-home-card";
import { UpcomingEventsCard } from "./UpcomingEventsCard";

const NOTES_LIMIT = 5;

/**
 * The mentor's Home (owner, 2026-11-07): nothing season-shaped. Four numbers,
 * each opening its list: follow-ups due, students absent lately, notes this
 * week, everyone. Then the newest notes and the upcoming events every Home keeps.
 * The numbers are the totals of the lists they open (GET /me/mentor-summary).
 */
export function MentorDashboard() {
  const router = useRouter();
  const name = useSessionStore((s) => s.user?.name ?? null);
  // As the leader's Today: a blank name keeps the plain title, not "Hi, there".
  const named = (name ?? "").trim() !== "";
  const summary = useMentorSummary(true);
  const notes = useVisibleNotes(NOTES_LIMIT, true);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);

  const refresh = () => {
    void summary.refetch();
    void notes.refetch();
    void events.refetch();
  };

  return (
    <Screen
      home
      title={named ? `Hi, ${firstName(name)}` : "Home"}
      compactTitle="Home"
      onRefresh={refresh}
      refreshing={summary.isRefetching || notes.isRefetching || events.isRefetching}
    >
      <View className="flex-col gap-6">
        <AnnouncementsHomeCard />
        {summary.isPending ? (
          <View accessible accessibilityLabel="Loading" className="flex-row flex-wrap gap-3">
            <Skeleton className="h-[104px] min-w-[140px] flex-1 basis-[45%] rounded-group" />
            <Skeleton className="h-[104px] min-w-[140px] flex-1 basis-[45%] rounded-group" />
          </View>
        ) : summary.isError ? (
          <InlineError message="Couldn't load your numbers." onRetry={() => void summary.refetch()} />
        ) : (
          <View testID="mentor-figures" className="flex-row flex-wrap gap-3">
            <CountTile
              label="Follow-ups due"
              value={summary.data.followUpsDue}
              icon={Flag}
              tone="warn"
              onPress={() => router.push("/follow-ups")}
            />
            <CountTile
              label="Absent lately"
              value={summary.data.absentLately}
              icon={UserX}
              tone="bad"
              onPress={() => router.push({ pathname: "/students", params: { absent: "1" } })}
            />
            <FigureTile
              label="Notes this week"
              value={String(summary.data.notesThisWeek)}
              icon={NotebookPen}
              onPress={() => router.push({ pathname: "/notes", params: { range: "week" } })}
            />
            <FigureTile
              label="Members"
              value={String(summary.data.students)}
              icon={Users}
              onPress={() => router.push("/students")}
            />
          </View>
        )}

        {notes.isPending ? (
          <GroupedList header="Recent notes">
            <View accessible accessibilityLabel="Loading" className="flex-col gap-2.5 p-4">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </View>
          </GroupedList>
        ) : notes.isError ? (
          <GroupedList header="Recent notes">
            <InlineError className="p-4" message="Couldn't load recent notes." onRetry={() => void notes.refetch()} />
          </GroupedList>
        ) : (
          <RecentNotesGroup notes={notes.data} />
        )}

        <UpcomingEventsCard query={events} />
      </View>
    </Screen>
  );
}
