import { useState, type ReactNode } from "react";
import { Linking, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Trash2 } from "lucide-react-native";
import type { JpcEventDetail } from "@space/shared";

import {
  EventForm,
  VISIBILITY_LABELS,
  type EventFormValues,
} from "../../../src/components/EventForm";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { Screen } from "../../../src/design/layout/screen";
import { iconWithClassName } from "../../../src/design/lib/icon";
import { Button, EmptyState, GroupedList, ListRow, StatusChip, Text } from "../../../src/design/ui";
import { ConfirmDialog } from "../../../src/design/ui/confirm-dialog";
import { useDeleteEvent, useEventDetail, useUpdateEvent } from "../../../src/hooks/use-events";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { formatEventWhen } from "../../../src/lib/format";
import { parsePositiveInt } from "../../../src/lib/params";

iconWithClassName(Trash2);

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
  const router = useRouter();
  const update = useUpdateEvent(event.id);
  const remove = useDeleteEvent();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  return (
    <>
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant="secondary"
          onPress={() => {
            setMessage(null);
            setEditing(true);
          }}
        >
          Edit
        </Button>
        <Button
          variant="destructive"
          onPress={() => {
            setDeleteError(null);
            setConfirming(true);
          }}
        >
          <Trash2 size={14} className="text-white" />
          Delete event
        </Button>
      </View>
      {deleteError ? (
        <Text variant="subhead" className="text-bad" accessibilityRole="alert">
          {deleteError}
        </Text>
      ) : null}
      <EventForm
        open={editing}
        title="Edit event"
        initial={toFormValues(event)}
        submitLabel="Save changes"
        submitting={update.isPending}
        message={message}
        onClose={() => setEditing(false)}
        onSubmit={(body) => {
          setMessage(null);
          update.mutate(body, {
            onSuccess: () => setEditing(false),
            onError: (err) => setMessage(apiErrorMessage(err, "Couldn't save the event.")),
          });
        }}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete event?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(event.id, {
            onSuccess: () => {
              setConfirming(false);
              router.dismissTo("/events");
            },
            onError: (err) => {
              setConfirming(false);
              setDeleteError(apiErrorMessage(err, "Couldn't delete the event."));
            },
          })
        }
      />
    </>
  );
}

export default function EventDetailScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(raw);
  const detail = useEventDetail(id);

  let body: ReactNode;
  let title = "Event";
  let subtitle: string | undefined;
  if (id === null) body = <EmptyState title="Not found" description="That event doesn't exist." />;
  else if (detail.isPending) body = <RouteSkeleton />;
  else if (detail.isError) body = <RouteError onRetry={() => void detail.refetch()} />;
  else {
    const e = detail.data;
    title = e.title;
    subtitle = formatEventWhen(e);
    const visibility =
      e.visibility === "SEASON"
        ? (e.seasonTitle ?? VISIBILITY_LABELS.SEASON)
        : VISIBILITY_LABELS[e.visibility];
    body = (
      <View className="flex-col gap-4">
        <StatusChip
          tone={e.visibility === "ALL" ? "neutral" : e.visibility === "SEASON" ? "info" : "warn"}
          label={visibility}
          className="self-start"
        />
        {e.description ? <Text variant="body">{e.description}</Text> : null}
        {e.url ? (
          <GroupedList>
            <ListRow
              title="Open link"
              subtitle={e.url}
              chevron
              onPress={() => void Linking.openURL(e.url ?? "")}
            />
          </GroupedList>
        ) : null}
        {e.canManage ? <ManageEvent key={e.id} event={e} /> : null}
      </View>
    );
  }

  return (
    <Screen title={title} subtitle={subtitle}>
      {body}
    </Screen>
  );
}
