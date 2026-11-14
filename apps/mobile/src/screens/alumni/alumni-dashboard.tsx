import { useRouter } from "expo-router";
import { Linking, View } from "react-native";
import { classLabel, UPCOMING_EVENTS_LIMIT } from "@space/shared";

import { InlineError } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { GroupedList, HeroCard, ListRow, Skeleton, StatusChip } from "../../design/ui";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useSeasonHistory } from "../../hooks/use-self-service";
import { firstName, formatEventWhenShort, formatSeasonDay } from "../../lib/format";
import { FinishedSeasonCard } from "../today/finished-season-card";
import { UpcomingEventsGroup } from "../events/upcoming-events-group";
import { AnnouncementsHomeFeed } from "../announcements/home-feed";
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
 * The alumnus's Today: the next event as the one hero (its title opens it, as the
 * session card's does), the others as rows, then the last few seasons. The season
 * in "Your last season" is not listed again under Your seasons (owner, 2026-11-09). Its data is the events list and `/me/season-history` —
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
  const latest = history.data?.[0];
  const showLatest = latest !== undefined && latest.outcome !== "DROPPED";
  const earlier = (history.data ?? []).slice(showLatest ? 1 : 0, (showLatest ? 1 : 0) + HISTORY_ROWS);
  const [next, ...others] = events.data?.events ?? [];
  const openEvent = (e: NonNullable<typeof next>) => {
    if (e.url) void Linking.openURL(e.url);
    else router.push({ pathname: "/event/[id]", params: { id: String(e.id) } });
  };

  return (
    <Screen
      home
      title={`Hi, ${firstName(name)}`}
      subtitle={graduationYear === null ? "Alumni" : classLabel(graduationYear)}
      compactTitle="Home"
      onRefresh={refresh}
      refreshing={events.isRefetching || history.isRefetching}
    >
      <View className="flex-col gap-6">
        {/* Owner 2026-11-14: announcements as a news feed, first. */}
        <AnnouncementsHomeFeed />
        {showLatest ? <FinishedSeasonCard row={latest} /> : null}
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
              onTitlePress={() => openEvent(next)}
            />
            {others.length > 0 ? <UpcomingEventsGroup events={others} header="Also coming up" /> : null}
          </>
        ) : null}

        {history.isPending ? (
          <Loading header="Your seasons" />
        ) : history.isError ? (
          <Failed header="Your seasons" message="Couldn't load your seasons." onRetry={() => void history.refetch()} />
        ) : history.data.length === 0 ? (
          <GroupedList header="Your seasons">
            <ListRow title="No past seasons yet" subtitle="Seasons you finish show here." />
          </GroupedList>
        ) : earlier.length > 0 ? (
          // Owner 2026-11-14: one list. Each season opens itself; See all is the full history.
          <GroupedList
            header="Your seasons"
            headerAction={{ label: "See all", onPress: () => router.push("/history") }}
          >
            {earlier.map((s) => (
              <ListRow
                key={s.seasonId}
                title={s.title}
                titleLines={2}
                subtitle={`${formatSeasonDay(s.startDate)} – ${formatSeasonDay(s.endDate)}${s.groupName ? ` · ${s.groupName}` : ""}`}
                trailing={<StatusChip tone="neutral" label={`${s.attendancePct}% attended`} />}
                trailingPlacement="below"
                chevron
                onPress={() =>
                  router.push({ pathname: "/past-season/[seasonId]", params: { seasonId: String(s.seasonId) } })
                }
              />
            ))}
          </GroupedList>
        ) : null}
      </View>
    </Screen>
  );
}
