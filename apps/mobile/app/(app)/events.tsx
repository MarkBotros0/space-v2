import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { EMPTY_EVENT_VALUES, EventForm, VISIBILITY_LABELS } from "../../src/components/EventForm";
import { useCreateEvent, useEvents } from "../../src/hooks/use-events";
import { apiErrorMessage } from "../../src/lib/api-error";
import { formatEventWhen } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

/** SUPER's collapsible "New event" form. Wall-clock fields only; the server composes the instant (X13). */
function NewEvent() {
  const theme = useTheme();
  const create = useCreateEvent();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!open) return <Button title="New event" onPress={() => setOpen(true)} />;
  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <Text variant="heading">New event</Text>
      <EventForm
        initial={EMPTY_EVENT_VALUES}
        submitLabel="Create event"
        submitting={create.isPending}
        message={message}
        onSubmit={(body) => {
          setMessage(null);
          create.mutate(body, {
            onSuccess: () => setOpen(false),
            onError: (err) => setMessage(apiErrorMessage(err, "Couldn't create the event.")),
          });
        }}
      />
      <Button title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
    </Card>
  );
}

/**
 * /events — one route, role branches inside, as /calendar does. Everyone gets
 * the same read-only list (a deep link must never crash: ALUMNI's "Events" nav
 * entry points at /calendar, so a mis-tap here is likely); only SUPER gets the
 * create form.
 */
export default function EventsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const events = useEvents();

  let body;
  if (events.isPending) body = <LoadingState />;
  else if (events.isError) body = <ErrorState message="Couldn't load events. Check your connection and try again." onRetry={() => void events.refetch()} />;
  else if (events.data.length === 0)
    // v1's card renders nothing at all here (R75); say so instead.
    body = <EmptyState title="No upcoming events" message="Nothing is scheduled in the next year." />;
  else
    body = (
      <>
        {events.data.map((e) => (
          <Card
            key={e.id}
            style={{ marginTop: theme.spacing.sm }}
            onPress={() => router.push({ pathname: "/event/[id]", params: { id: String(e.id) } })}
          >
            <Text variant="body">{e.title}</Text>
            {/* Every piece of the label is the server's org-clock value (X13). */}
            <Text variant="label" color={theme.colors.neutral[600]}>{formatEventWhen(e)}</Text>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {e.visibility === "SEASON" ? (e.seasonCode ?? VISIBILITY_LABELS.SEASON) : VISIBILITY_LABELS[e.visibility]}
            </Text>
          </Card>
        ))}
      </>
    );

  return (
    <Screen edges={["top", "left", "right"]} scroll onRefresh={() => void events.refetch()} refreshing={events.isRefetching}>
      <View style={{ gap: theme.spacing.sm }}>
        {isSuper ? <NewEvent /> : null}
        {body}
      </View>
    </Screen>
  );
}
