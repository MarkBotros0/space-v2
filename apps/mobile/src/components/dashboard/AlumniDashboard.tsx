import { useRouter } from "expo-router";
import { Linking, View } from "react-native";
import { UPCOMING_EVENTS_LIMIT } from "@space/shared";

import { InlineError } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { Button, GroupedList, HeroCard, ListRow, Skeleton, StatusChip } from "../../design/ui";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useSeasonHistory } from "../../hooks/use-self-service";
import { firstName, formatEventWhenShort, formatSeasonDay } from "../../lib/format";
import { UpcomingEventsGroup } from "../../screens/events/upcoming-events-group";
import { useSessionStore } from "../../store/session";

const HISTORY_ROWS = 3;

function Loading({ header }: { header?: string }) {
  return (
    <GroupedList header={header}>
      <View accessible accessibilityLabel="Loading" className="flex-col gap-2.5 p-4">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </View>
    </GroupedList>
  );
}

function Failed({ header, message, onRetry }: { header: string; message: string; onRetry: () => void }) {
  return (
    <GroupedList header={header}>
      <InlineError className="p-4" message={message} onRetry={onRetry} />
    </GroupedList>
  );
}

/**
 * The alumnus's Today: the next event as the one hero, the others as rows, then
 * the last few seasons. Its data is the events list and `/me/season-history` —
 * never `/me/dashboard`, which answers an alumnus 403 (spec 19 §7).
 */
export function AlumniDashboard() {
  const router = useRouter();
  const name = useSessionStore((s) => s.user?.name ?? null);
  const graduationYear = useSessionStore((s) => s.scopes?.graduationYear ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);
  const history = useSeasonHistory(activeSeasonId, true);

  const refresh = () => {
    void events.refetch();
    void history.refetch();
  };
  const [next, ...others] = events.data?.events ?? [];

  return (
    <Screen
      home
      title={`Hi, ${firstName(name)}`}
      subtitle={`Class of ${graduationYear ?? "—"}`}
      compactTitle="Today"
      onRefresh={refresh}
      refreshing={events.isRefetching || history.isRefetching}
    >
      <View className="flex-col gap-6">
        {events.isPending ? (
          <Loading />
        ) : events.isError ? (
          <InlineError message="Couldn't load upcoming events." onRetry={() => void events.refetch()} />
        ) : next ? (
          <>
            <HeroCard
              eyebrow="Next event"
              title={next.title}
              meta={formatEventWhenShort(next)}
              action={
                next.url ? (
                  <Button variant="primary" onPress={() => void Linking.openURL(next.url!)}>
                    Open link
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onPress={() => router.push({ pathname: "/event/[id]", params: { id: String(next.id) } })}
                  >
                    View event
                  </Button>
                )
              }
            />
            {others.length > 0 ? <UpcomingEventsGroup events={others} header="Also coming up" /> : null}
          </>
        ) : (
          <GroupedList header="Upcoming events">
            <ListRow title="No upcoming events" subtitle="Nothing is scheduled from today onwards." />
          </GroupedList>
        )}

        {history.isPending ? (
          <Loading header="Your history" />
        ) : history.isError ? (
          <Failed header="Your history" message="Couldn't load your history." onRetry={() => void history.refetch()} />
        ) : (
          <GroupedList header="Your history">
            {history.data.length === 0 ? (
              <ListRow title="No past seasons" />
            ) : (
              history.data.slice(0, HISTORY_ROWS).map((s, i) => (
                <ListRow
                  key={s.seasonId}
                  index={i}
                  title={s.title}
                  titleLines={2}
                  subtitle={`${formatSeasonDay(s.startDate)} – ${formatSeasonDay(s.endDate)}${s.groupName ? ` · ${s.groupName}` : ""}`}
                  trailing={<StatusChip tone="neutral" label={`${s.attendancePct}% attended`} />}
                  onPress={() => router.push("/history")}
                />
              ))
            )}
            <ListRow title="View my history" chevron onPress={() => router.push("/history")} />
          </GroupedList>
        )}
      </View>
    </Screen>
  );
}
