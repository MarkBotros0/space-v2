import { useRouter } from "expo-router";
import { View } from "react-native";
import { UPCOMING_EVENTS_LIMIT } from "@space/shared";

import { InlineError } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { GroupedList, ListRow, Skeleton } from "../../design/ui";
import { useMentorDashboard } from "../../hooks/use-dashboard";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useVisibleNotes } from "../../hooks/use-notes";
import { useEngagementReport } from "../../hooks/use-reports";
import { firstName } from "../../lib/format";
import { AtRiskGroup } from "../../screens/mentor/at-risk-group";
import { RecentActivityGroup } from "../../screens/mentor/recent-activity-group";
import { RecentNotesGroup } from "../../screens/mentor/recent-notes-group";
import { useSessionStore } from "../../store/session";
import { UpcomingEventsCard } from "./UpcomingEventsCard";

const NOTES_LIMIT = 5;

function GroupLoading({ header }: { header: string }) {
  return (
    <GroupedList header={header}>
      <View accessible accessibilityLabel="Loading" className="flex-col gap-2.5 p-4">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </View>
    </GroupedList>
  );
}

function GroupError({ header, message, onRetry }: { header: string; message: string; onRetry: () => void }) {
  return (
    <GroupedList header={header}>
      <InlineError className="p-4" message={message} onRetry={onRetry} />
    </GroupedList>
  );
}

/**
 * The mentor's Today: who is at risk, the newest notes, recent activity, then
 * the upcoming-events card every Today keeps. v2 decisions kept (B6-1): the
 * at-risk list shares Reports' cache (D17) and the quick links are tabs.
 */
export function MentorDashboard() {
  const router = useRouter();
  const name = useSessionStore((s) => s.user?.name ?? null);
  // As the leader's Today: a blank name keeps the plain title, not "Hi, there".
  const named = (name ?? "").trim() !== "";
  // D17: the SAME query key as the mentor's Reports tab, so Home and Reports
  // cannot show different at-risk sets. No seasonId = the mentor's whole scope.
  const engagement = useEngagementReport(null, true);
  const notes = useVisibleNotes(NOTES_LIMIT, true);
  const feed = useMentorDashboard();
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);

  const refresh = () => {
    void engagement.refetch();
    void notes.refetch();
    void feed.refetch();
    void events.refetch();
  };

  return (
    <Screen
      home
      title={named ? `Hi, ${firstName(name)}` : "Home"}
      compactTitle="Home"
      onRefresh={refresh}
      refreshing={
        engagement.isRefetching || notes.isRefetching || feed.isRefetching || events.isRefetching
      }
    >
      <View className="flex-col gap-6">
        {engagement.isPending ? (
          <GroupLoading header="At risk" />
        ) : engagement.isError ? (
          <GroupError
            header="At risk"
            message="Couldn't load the at-risk list."
            onRetry={() => void engagement.refetch()}
          />
        ) : (
          <AtRiskGroup
            rows={engagement.data.atRisk}
            total={engagement.data.atRiskTotal}
            footer={<ListRow title="All students" chevron onPress={() => router.push("/students")} />}
          />
        )}

        {notes.isPending ? (
          <GroupLoading header="Recent notes" />
        ) : notes.isError ? (
          <GroupError
            header="Recent notes"
            message="Couldn't load recent notes."
            onRetry={() => void notes.refetch()}
          />
        ) : (
          <RecentNotesGroup notes={notes.data} />
        )}

        {feed.isPending ? (
          <GroupLoading header="Recent activity" />
        ) : feed.isError ? (
          <GroupError
            header="Recent activity"
            message="Couldn't load recent activity."
            onRetry={() => void feed.refetch()}
          />
        ) : (
          <RecentActivityGroup items={feed.data.recentActivity} />
        )}

        <UpcomingEventsCard query={events} />
      </View>
    </Screen>
  );
}
