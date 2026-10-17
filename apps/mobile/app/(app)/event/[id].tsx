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
import { PageTitle } from "../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
import { iconWithClassName } from "../../../src/design/lib/icon";
import { Badge, Button, Card, CardContent, EmptyState, Text } from "../../../src/design/ui";
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

  return (
    <>
      {editing ? (
        <Card>
          <CardContent className="pt-6">
            <View className="flex-col gap-4">
              <Text accessibilityRole="header" className="text-base font-semibold">
                Edit event
              </Text>
              <EventForm
                initial={toFormValues(event)}
                submitLabel="Save changes"
                submitting={update.isPending}
                message={message}
                onCancel={() => setEditing(false)}
                onSubmit={(body) => {
                  setMessage(null);
                  update.mutate(body, {
                    onSuccess: () => setEditing(false),
                    onError: (err) => setMessage(apiErrorMessage(err, "Couldn't save the event.")),
                  });
                }}
              />
            </View>
          </CardContent>
        </Card>
      ) : (
        <View className="flex-row gap-2">
          <Button variant="outline" onPress={() => setEditing(true)}>
            Edit
          </Button>
          <Button variant="destructive" onPress={() => setConfirming(true)}>
            <Trash2 size={14} className="text-white" />
            Delete event
          </Button>
        </View>
      )}
      {message && !editing ? <Text className="text-sm text-error-600">{message}</Text> : null}
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
              router.back();
            },
            onError: (err) => {
              setConfirming(false);
              setMessage(apiErrorMessage(err, "Couldn't delete the event."));
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
  if (id === null) body = <EmptyState title="Not found" description="That event doesn't exist." />;
  else if (detail.isPending) body = <RouteSkeleton />;
  else if (detail.isError) body = <RouteError onRetry={() => void detail.refetch()} />;
  else {
    const e = detail.data;
    body = (
      <View className="flex-col gap-4">
        <PageTitle title={e.title} size="detail" subtitle={formatEventWhen(e)} />
        <Card>
          <CardContent className="gap-3 pt-6">
            <Badge variant={e.visibility === "ALL" ? "outline" : "warning"} className="self-start">
              {e.visibility === "SEASON"
                ? (e.seasonTitle ?? VISIBILITY_LABELS.SEASON)
                : VISIBILITY_LABELS[e.visibility]}
            </Badge>
            {e.description ? <Text className="text-sm">{e.description}</Text> : null}
            {e.url ? (
              <Button
                variant="outline"
                className="self-start"
                onPress={() => void Linking.openURL(e.url ?? "")}
              >
                Open link
              </Button>
            ) : null}
          </CardContent>
        </Card>
        {e.canManage ? <ManageEvent key={e.id} event={e} /> : null}
      </View>
    );
  }

  return <ShellFrame>{body}</ShellFrame>;
}
