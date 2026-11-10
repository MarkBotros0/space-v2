import { useState } from "react";
import { View } from "react-native";
import { Plus } from "lucide-react-native";

import { EMPTY_EVENT_VALUES, EventForm } from "../../src/components/EventForm";
import { NAV_ICONS } from "../../src/design/icons/nav-icon";
import { queryStateView } from "../../src/design/layout/route-states";
import { Screen } from "../../src/design/layout/screen";
import { iconWithClassName } from "../../src/design/lib/icon";
import { Button, EmptyState, GroupedList } from "../../src/design/ui";
import { useCreateEvent, useEventPages } from "../../src/hooks/use-events";
import { apiErrorMessage } from "../../src/lib/api-error";
import { EventListRow } from "../../src/screens/events/event-row";
import { useIsSuper } from "../../src/store/session";
import { LoadMoreButton } from "../../src/design/ui/load-more-button";

iconWithClassName(Plus);

/**
 * /events — v1 super/events ("JPC Events", B5-4). One route, role branches
 * inside, as /calendar does. Everyone gets the same list (a deep link must
 * never crash: ALUMNI's "Events" nav entry points at /calendar, so a mis-tap
 * here is likely); only SUPER gets New event, which opens the form in a sheet.
 * Edit and delete live on the event's own page. V2-ONLY: the list is paged,
 * newest first, 25 at a time behind "Load more" (owner decision).
 */
export default function EventsScreen() {
  const isSuper = useIsSuper();
  const events = useEventPages();
  const rows = events.data?.pages.flatMap((p) => p.events) ?? [];
  const create = useCreateEvent();
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  let body;
  const eventsState = queryStateView(events);
  if (eventsState) body = eventsState;
  else if (rows.length === 0)
    // v1's card renders nothing at all here (R75); say so instead.
    body = (
      <EmptyState
        icon={NAV_ICONS.events}
        title={isSuper ? "No JPC events yet" : "No upcoming events"}
        description={
          isSuper ? "Create an event to share with all members or alumni." : "Nothing is scheduled in the next year."
        }
      />
    );
  else
    body = (
      <View className="flex-col gap-3">
        <GroupedList>
          {rows.map((e) => (
            <EventListRow key={e.id} event={e} />
          ))}
        </GroupedList>
        {/* Paging is v2's (owner decision); v1 loaded every event. */}
        <LoadMoreButton query={events} loadingLabel="Loading…" className="self-center" />
      </View>
    );

  return (
    <Screen
      title="JPC Events"
      subtitle="Organisation-wide events visible on all members' calendars."
      refreshing={events.isRefetching}
      onRefresh={() => void events.refetch()}
      trailing={
        isSuper ? (
          <Button
            onPress={() => {
              setMessage(null);
              setCreating(true);
            }}
          >
            <Plus size={16} className="text-primary-foreground" />
            New event
          </Button>
        ) : undefined
      }
    >
      {body}
      {isSuper ? (
        <EventForm
          open={creating}
          title="New JPC event"
          initial={EMPTY_EVENT_VALUES}
          submitLabel="Create event"
          submitting={create.isPending}
          message={message}
          onClose={() => setCreating(false)}
          onSubmit={(b) => {
            setMessage(null);
            create.mutate(b, {
              onSuccess: () => setCreating(false),
              onError: (err) => setMessage(apiErrorMessage(err, "Couldn't create the event.")),
            });
          }}
        />
      ) : null}
    </Screen>
  );
}
