import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { CalendarDays, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react-native";
import type { JpcEventListItem } from "@space/shared";

import { EMPTY_EVENT_VALUES, EventForm, VISIBILITY_LABELS } from "../../src/components/EventForm";
import { PageTitle } from "../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import { iconWithClassName } from "../../src/design/lib/icon";
import { Badge, Button, Card, CardContent, EmptyState, Text } from "../../src/design/ui";
import { ConfirmDialog } from "../../src/design/ui/confirm-dialog";
import { useCreateEvent, useDeleteEvent, useEvents } from "../../src/hooks/use-events";
import { apiErrorMessage } from "../../src/lib/api-error";
import { formatEventWhen } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";

iconWithClassName(ExternalLink);
iconWithClassName(Pencil);
iconWithClassName(Trash2);
iconWithClassName(Plus);

const visibilityLabel = (e: JpcEventListItem) =>
  e.visibility === "SEASON"
    ? (e.seasonCode ?? VISIBILITY_LABELS.SEASON)
    : VISIBILITY_LABELS[e.visibility];

/** v1 jpc-event-manager-client.tsx `<li>`: title + visibility badge, when, link; pencil and trash for SUPER. */
function EventRow({
  event,
  canManage,
  onOpen,
  onDelete,
}: {
  event: JpcEventListItem;
  canManage: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <View className="flex-row items-center gap-3 rounded-lg border border-border bg-card p-4">
      <Pressable accessibilityRole="button" className="min-w-0 flex-1 gap-1" onPress={onOpen}>
        <View className="flex-row flex-wrap items-center gap-2">
          <Text numberOfLines={1} className="shrink font-semibold">
            {event.title}
          </Text>
          <Badge variant={event.visibility === "ALL" ? "outline" : "warning"}>
            {visibilityLabel(event)}
          </Badge>
        </View>
        {/* Every piece of the label is the server's org-clock value (X13). */}
        <Text className="text-sm text-muted-foreground">{formatEventWhen(event)}</Text>
        {event.url ? (
          <Pressable
            accessibilityRole="link"
            className="flex-row items-center gap-1 self-start"
            onPress={() => void Linking.openURL(event.url ?? "")}
          >
            <ExternalLink size={12} className="text-brand-teal-500" />
            <Text numberOfLines={1} className="shrink text-xs text-brand-teal-500">
              {event.url}
            </Text>
          </Pressable>
        ) : null}
      </Pressable>
      {canManage ? (
        <View className="shrink-0 flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            accessibilityLabel={`Edit ${event.title}`}
            onPress={onOpen}
          >
            <Pencil size={14} className="text-foreground" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            accessibilityLabel={`Delete ${event.title}`}
            onPress={onDelete}
          >
            <Trash2 size={14} className="text-error-500" />
          </Button>
        </View>
      ) : null}
    </View>
  );
}

/** SUPER's "New event" panel, replacing the list while open (v1). Wall-clock fields only; the server composes the instant (X13). */
function NewEvent({ onDone }: { onDone: () => void }) {
  const create = useCreateEvent();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <View className="flex-col gap-4">
      <PageTitle title="New JPC event" size="detail" />
      <Card>
        <CardContent className="pt-6">
          <EventForm
            initial={EMPTY_EVENT_VALUES}
            submitLabel="Create event"
            submitting={create.isPending}
            message={message}
            onCancel={onDone}
            onSubmit={(body) => {
              setMessage(null);
              create.mutate(body, {
                onSuccess: onDone,
                onError: (err) => setMessage(apiErrorMessage(err, "Couldn't create the event.")),
              });
            }}
          />
        </CardContent>
      </Card>
    </View>
  );
}

/**
 * /events — v1 super/events ("JPC Events", B5-4). One route, role branches
 * inside, as /calendar does. Everyone gets the same list (a deep link must
 * never crash: ALUMNI's "Events" nav entry points at /calendar, so a mis-tap
 * here is likely); only SUPER gets New event and the row actions. The edit
 * pencil opens the event, whose page holds the edit form.
 */
export default function EventsScreen() {
  const router = useRouter();
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const events = useEvents();
  const remove = useDeleteEvent();
  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (creating && isSuper) {
    return (
      <ShellFrame>
        <NewEvent onDone={() => setCreating(false)} />
      </ShellFrame>
    );
  }

  let body;
  if (events.isPending) body = <RouteSkeleton />;
  else if (events.isError) body = <RouteError onRetry={() => void events.refetch()} />;
  else if (events.data.length === 0)
    // v1's card renders nothing at all here (R75); say so instead.
    body = (
      <EmptyState
        icon={CalendarDays}
        title={isSuper ? "No JPC events yet" : "No upcoming events"}
        description={
          isSuper
            ? "Create an event to share with all members or alumni."
            : "Nothing is scheduled in the next year."
        }
      />
    );
  else
    body = (
      <View className="flex-col gap-3">
        {events.data.map((e) => (
          <EventRow
            key={e.id}
            event={e}
            canManage={isSuper}
            onOpen={() => router.push({ pathname: "/event/[id]", params: { id: String(e.id) } })}
            onDelete={() => {
              setDeleteError(null);
              setConfirmId(e.id);
            }}
          />
        ))}
      </View>
    );

  return (
    <ShellFrame refreshing={events.isRefetching} onRefresh={() => void events.refetch()}>
      <View className="flex-col gap-4">
        <View className="flex-row items-start justify-between gap-4">
          <PageTitle
            className="min-w-0 flex-1"
            title="JPC Events"
            subtitle="Organisation-wide events visible on all members' calendars."
          />
          {isSuper ? (
            <Button onPress={() => setCreating(true)}>
              <Plus size={16} className="text-primary-foreground" />
              New event
            </Button>
          ) : null}
        </View>
        {deleteError ? (
          <Text className="text-sm text-error-600" accessibilityRole="alert">
            {deleteError}
          </Text>
        ) : null}
        {body}
      </View>
      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmId(null);
        }}
        title="Delete event?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (confirmId === null) return;
          remove.mutate(confirmId, {
            onSuccess: () => setConfirmId(null),
            onError: (err) => {
              setConfirmId(null);
              setDeleteError(apiErrorMessage(err, "Couldn't delete the event."));
            },
          });
        }}
      />
    </ShellFrame>
  );
}
