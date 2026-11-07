/**
 * Follow up on a student's page, for their mentor (owner, 2026-11-07). With no
 * open follow-up: one button, which asks for an optional reason in a sheet.
 * With one: when it is due (or that it is due now), the reason, and Done. The
 * reminder after 7 days is the server's; this card only says when.
 */
import type { FollowUp } from "@space/shared";
import { useState } from "react";
import { View } from "react-native";

import { haptic } from "../../design/motion";
import { Button } from "../../design/ui/button";
import { Sheet, SheetSaveBar } from "../../design/ui/sheet";
import { Text } from "../../design/ui/text";
import { Textarea } from "../../design/ui/textarea";
import { toast } from "../../design/ui/toaster";
import { InlineError } from "../../design/layout/route-states";
import { isDue, useCreateFollowUp, useFollowUps, useMarkFollowUpDone } from "../../hooks/use-follow-ups";
import { apiErrorMessage } from "../../lib/api-error";
import { formatDate } from "../../lib/format";
import { FOLLOW_UP_DAYS, FOLLOW_UP_REASON_MAX } from "@space/shared";

function OpenFollowUp({ followUp }: { followUp: FollowUp }) {
  const done = useMarkFollowUpDone();
  const due = isDue(followUp);
  return (
    <View testID="follow-up-card" className="flex-col gap-3 rounded-group bg-warn-soft p-4">
      <View className="flex-col gap-1">
        <Text variant="headline">{due ? "Time to follow up" : "You're following up"}</Text>
        <Text variant="subhead" className="text-foreground">
          {due
            ? `You flagged them on ${formatDate(followUp.createdAt)}.`
            : `We'll remind you on ${formatDate(followUp.dueAt)}.`}
          {followUp.reason ? ` ${followUp.reason}` : ""}
        </Text>
      </View>
      <Button
        variant="secondary"
        className="self-start"
        loading={done.isPending}
        onPress={() =>
          done.mutate(
            { id: followUp.id },
            {
              onSuccess: () => toast.success("Marked done."),
              onError: (err) => toast.error(apiErrorMessage(err, "Couldn't mark it done. Try again.")),
            },
          )
        }
      >
        Mark done
      </Button>
    </View>
  );
}

export function FollowUpCard({ studentId, studentName }: { studentId: number; studentName: string }) {
  const list = useFollowUps(true);
  const create = useCreateFollowUp();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // A failed background refresh keeps what was loaded; only a first load that failed says so.
  if (!list.data) {
    return list.isError ? (
      <InlineError message="Couldn't load your follow-ups." onRetry={() => void list.refetch()} />
    ) : null;
  }
  const current = list.data.find((f) => f.studentUserId === studentId && f.doneAt === null);
  if (current) return <OpenFollowUp followUp={current} />;

  const submit = () => {
    setError(null);
    create.mutate(
      { studentId, body: { reason: reason.trim() || null } },
      {
        onSuccess: () => {
          setReason("");
          haptic("light");
          toast.success(`We'll remind you in ${FOLLOW_UP_DAYS} days.`);
          setOpen(false);
        },
        onError: (err) => setError(apiErrorMessage(err, "Couldn't save that. Try again.")),
      },
    );
  };

  return (
    <>
      <Button variant="secondary" className="self-start" onPress={() => setOpen(true)}>
        Remind me to follow up
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Follow up with ${studentName}`}
        footer={<SheetSaveBar label="Remind me in a week" onPress={submit} loading={create.isPending} error={error} />}
      >
        <View className="flex-col gap-2 pb-4">
          <Text variant="subhead" className="text-muted-foreground">
            {`We'll remind you once in ${FOLLOW_UP_DAYS} days. It stays on your Follow-ups until you mark it done.`}
          </Text>
          <Textarea
            accessibilityLabel="Why (optional)"
            placeholder="Why (optional)"
            value={reason}
            onChangeText={setReason}
            maxLength={FOLLOW_UP_REASON_MAX}
            className="min-h-24"
          />
        </View>
      </Sheet>
    </>
  );
}
