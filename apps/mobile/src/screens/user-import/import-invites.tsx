/**
 * Sending the invites from the import result (owner 2026-11-14: "onboard people on the first
 * use"). An import still sends nothing by itself (Spec R55); this is the Community tab's
 * "Send invites" batch offered where the operator already is. It reaches everyone waiting for
 * an invite, not only this paste, so the line says so. One batch per tap after a confirm (Plan 10
 * Decision 12); the last batch's counts stay on screen instead of an alert.
 */
import { useState } from "react";
import { Alert, View } from "react-native";
import { BULK_INVITE_BATCH_SIZE } from "@space/shared";

import { Button, Text } from "../../design/ui";
import { usePendingInviteCount, useSendPendingInvites } from "../../hooks/use-users";
import { apiErrorMessage } from "../../lib/api-error";
import { bulkSummary } from "../../lib/invite-feedback";

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

export function ImportInvites() {
  const pending = usePendingInviteCount(true);
  const send = useSendPendingInvites();
  const [last, setLast] = useState<string | null>(null);

  const count = pending.data;
  // Unknown or nothing waiting: no button that can't say whom it mails (R87).
  if (!count) {
    return last ? <Text className="text-sm text-muted-foreground">{`${last} Everyone has an invite now.`}</Text> : null;
  }

  const batch = Math.min(count, BULK_INVITE_BATCH_SIZE);
  const run = () =>
    Alert.alert(
      `Send invites to ${people(batch)}?`,
      count > batch ? `${people(count)} are waiting. ${BULK_INVITE_BATCH_SIZE} are sent per tap.` : undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: () =>
            send.mutate(undefined, {
              onSuccess: (r) => setLast(bulkSummary(r)),
              onError: (err) => Alert.alert("Couldn't send invites", apiErrorMessage(err, "Try again later.")),
            }),
        },
      ],
    );

  return (
    <View className="flex-col gap-2 rounded-group bg-surface p-4 dark:border dark:border-separator">
      <Text variant="headline">Send invites</Text>
      <Text className="text-sm text-muted-foreground">
        {`${people(count)} ${count === 1 ? "is" : "are"} waiting for an invite, counting anyone added before this import.`}
      </Text>
      {last ? <Text className="text-sm text-muted-foreground">{last}</Text> : null}
      <Button onPress={run} disabled={send.isPending}>
        {send.isPending
          ? "Sending…"
          : count > batch
            ? `Send the next ${batch} invites`
            : `Send ${batch} invite${batch === 1 ? "" : "s"}`}
      </Button>
    </View>
  );
}
