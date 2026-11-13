import type { QuizLiveRow } from "@space/shared";
import { useState } from "react";
import { View } from "react-native";

import { haptic } from "../../design/motion";
import { Button, ConfirmDialog, Sheet, StatusChip, Text } from "../../design/ui";
import { toast } from "../../design/ui/toaster";
import { useEndAttempt, useReopenAttempt } from "../../hooks/use-quizzes";
import { apiErrorMessage } from "../../lib/api-error";
import { RetakeButton } from "../quiz-grade/attempt-summary";
import { liveRowAction, type LiveRowView } from "./live-model";

/**
 * One student's actions on the live screen: End an open attempt, after a confirm, or allow a
 * retake on a finished one, as the grading sheet does. The confirm sits inside the sheet (as the
 * staff picker's does): closing one modal while opening another drops the second on iOS. The
 * sheet closes once End has gone through. A student who never started has no sheet.
 */
export function LiveRowSheet({
  quizId,
  row,
  view,
  open,
  onClose,
}: {
  quizId: number;
  row: QuizLiveRow;
  view: LiveRowView;
  open: boolean;
  onClose: () => void;
}) {
  const reopen = useReopenAttempt(quizId);
  const end = useEndAttempt(quizId);
  const [asking, setAsking] = useState(false);
  const action = liveRowAction(row);

  const onReopen = () => {
    reopen.mutate(row.studentUserId, {
      onSuccess: () => {
        haptic("light");
        toast.success("Retake allowed.");
        onClose();
      },
      onError: (err) => toast.error(apiErrorMessage(err, "Couldn't reopen the attempt.")),
    });
  };

  const confirmEnd = () => {
    end.mutate(row.studentUserId, {
      onSuccess: () => {
        haptic("light");
        toast.success("Attempt ended.");
        setAsking(false);
        onClose();
      },
      onError: (err) => {
        setAsking(false);
        toast.error(apiErrorMessage(err, "Couldn't end the attempt."));
      },
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title={view.title}>
      <View className="flex-col gap-4 pb-4">
        <View className="flex-col gap-2">
          <StatusChip {...view.stateChip} className="self-start" />
          <Text variant="subhead">{view.detail}</Text>
          {row.groupName ? (
            <Text variant="caption" className="text-muted-foreground">
              {row.groupName}
            </Text>
          ) : null}
        </View>
        {action === "end" ? (
          <Button size="sm" variant="destructive" className="self-start" onPress={() => setAsking(true)}>
            End attempt
          </Button>
        ) : null}
        {action === "reopen" ? <RetakeButton onPress={onReopen} disabled={reopen.isPending} /> : null}
      </View>
      {asking ? (
        <ConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next && !end.isPending) setAsking(false);
          }}
          title={`End ${view.title}'s attempt?`}
          description="Their saved answers are submitted."
          confirmLabel="End attempt"
          destructive
          pending={end.isPending}
          onConfirm={confirmEnd}
        />
      ) : null}
    </Sheet>
  );
}
