import { useState, type ReactNode } from "react";
import { Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { JpcEventDetail } from "@space/shared";

import { EventForm, VISIBILITY_LABELS, type EventFormValues } from "../../../src/components/EventForm";
import { useDeleteEvent, useEventDetail, useUpdateEvent } from "../../../src/hooks/use-events";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { formatEventWhen } from "../../../src/lib/format";
import { parsePositiveInt } from "../../../src/lib/params";
import { useTheme } from "../../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../src/ui";

/** Pre-filled from the server's org day and time (X13) — nothing converts zones here. */
function toFormValues(e: JpcEventDetail): EventFormValues {
  return {
    title: e.title,
    day: e.dayKey,
    time: e.time ?? "",
    endDay: e.endDayKey ?? "",
    description: e.description ?? "",
    url: e.url ?? "",
    visibility: e.visibility,
    seasonId: e.seasonId,
  };
}

function ManageEvent({ event }: { event: JpcEventDetail }) {
  const theme = useTheme();
  const router = useRouter();
  const update = useUpdateEvent(event.id);
  const remove = useDeleteEvent();
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onDelete = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    setMessage(null);
    remove.mutate(event.id, {
      onSuccess: () => router.back(),
      onError: (err) => setMessage(apiErrorMessage(err, "Couldn't delete the event.")),
    });
  };

  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      {editing ? (
        <>
          <Text variant="heading">Edit event</Text>
          <EventForm
            initial={toFormValues(event)}
            submitLabel="Save changes"
            submitting={update.isPending}
            message={message}
            onSubmit={(body) => {
              setMessage(null);
              update.mutate(body, {
                onSuccess: () => setEditing(false),
                onError: (err) => setMessage(apiErrorMessage(err, "Couldn't save the event.")),
              });
            }}
          />
          <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} />
        </>
      ) : (
        <Button title="Edit" variant="secondary" onPress={() => setEditing(true)} />
      )}
      {message && !editing ? <Text variant="label" color={theme.colors.error[500]}>{message}</Text> : null}
      <Button title={armed ? "Really delete?" : "Delete event"} variant="ghost" onPress={onDelete} loading={remove.isPending} />
    </Card>
  );
}

export default function EventDetailScreen() {
  const theme = useTheme();
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(raw);
  const detail = useEventDetail(id);

  let body: ReactNode;
  if (id === null) body = <EmptyState title="Not found" message="That event doesn't exist." />;
  else if (detail.isPending) body = <LoadingState />;
  else if (detail.isError) body = <ErrorState message="Couldn't load this event." onRetry={() => void detail.refetch()} />;
  else {
    const e = detail.data;
    body = (
      <>
        <Card style={{ gap: theme.spacing.sm }}>
          <Text variant="heading">{e.title}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>{formatEventWhen(e)}</Text>
          <Text variant="caption" color={theme.colors.neutral[600]}>
            {e.visibility === "SEASON" ? (e.seasonTitle ?? VISIBILITY_LABELS.SEASON) : VISIBILITY_LABELS[e.visibility]}
          </Text>
          {e.description ? <Text variant="body">{e.description}</Text> : null}
          {e.url ? <Button title="Open link" variant="secondary" onPress={() => void Linking.openURL(e.url ?? "")} /> : null}
        </Card>
        {e.canManage ? <ManageEvent key={e.id} event={e} /> : null}
      </>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {body}
    </Screen>
  );
}
