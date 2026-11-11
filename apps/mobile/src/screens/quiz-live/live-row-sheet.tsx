import type { QuizLiveRow } from "@space/shared";
import { View } from "react-native";

import { haptic } from "../../design/motion";
import { Button, Sheet, StatusChip, Text } from "../../design/ui";
import { toast } from "../../design/ui/toaster";
import { useReopenAttempt } from "../../hooks/use-quizzes";
import { apiErrorMessage } from "../../lib/api-error";
import { ReopenButton } from "../quiz-grade/quiz-answer-marker";
import { liveRowAction, type LiveRowView } from "./live-model";

/**
 * One student's actions on the live screen: End an open attempt (the caller confirms first, so
 * this sheet closes before the dialog opens) or Reopen a finished one as a retake, as the
 * grading sheet does. A student who never started has no sheet.
 */
export function LiveRowSheet({
  quizId,
  row,
  view,
  open,
  onClose,
  onEnd,
}: {
  quizId: number;
  row: QuizLiveRow;
  view: LiveRowView;
  open: boolean;
  onClose: () => void;
  onEnd: (row: QuizLiveRow) => void;
}) {
  const reopen = useReopenAttempt(quizId);
  const action = liveRowAction(row);

  const onReopen = () => {
    reopen.mutate(row.studentUserId, {
      onSuccess: () => {
        haptic("light");
        toast.success("Retake reopened.");
        onClose();
      },
      onError: (err) => toast.error(apiErrorMessage(err, "Couldn't reopen the attempt.")),
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
          <>
            <Text variant="subhead" className="text-muted-foreground">
              Ending submits the answers they have saved.
            </Text>
            <Button
              size="sm"
              variant="destructive"
              className="self-start"
              onPress={() => {
                onClose();
                onEnd(row);
              }}
            >
              End attempt
            </Button>
          </>
        ) : null}
        {action === "reopen" ? <ReopenButton onPress={onReopen} disabled={reopen.isPending} /> : null}
      </View>
    </Sheet>
  );
}
