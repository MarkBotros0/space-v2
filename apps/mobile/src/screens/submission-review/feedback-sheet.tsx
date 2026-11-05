import { useEffect, useState } from "react";
import { View } from "react-native";

import { haptic } from "../../design/motion";
import { Button } from "../../design/ui/button";
import { Sheet, SheetSaveBar } from "../../design/ui/sheet";
import { Textarea } from "../../design/ui/textarea";
import { toast } from "../../design/ui/toaster";
import { useReviewSubmission } from "../../hooks/use-submission";
import { apiErrorMessage } from "../../lib/api-error";

/**
 * Feedback travels as plain text (C11, B2-16). "Return for revision" is v2's
 * (spec 08 D11). The parent owns `feedback`, so dismissing keeps what was typed.
 * Like v1, a verdict keeps the reviewer on the page (B3-9); only a return leaves.
 */
export function FeedbackSheet({
  open,
  onClose,
  publicId,
  alreadyReviewed,
  feedback,
  onFeedback,
  onReturned,
}: {
  open: boolean;
  onClose: () => void;
  publicId: string;
  alreadyReviewed: boolean;
  feedback: string;
  onFeedback: (value: string) => void;
  onReturned: () => void;
}) {
  const review = useReviewSubmission(publicId);
  const [error, setError] = useState<string | null>(null);
  // A failure belongs to the visit that caused it: a reopened sheet starts clean.
  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const submit = (returnForRevision: boolean) => {
    setError(null);
    review.mutate(
      { feedback, returnForRevision },
      {
        onSuccess: () => {
          haptic("light");
          toast.success(returnForRevision ? "Returned for revision." : "Review saved.");
          onClose();
          // Returned work is the student's to edit now, so there is nothing left to do here.
          if (returnForRevision) onReturned();
        },
        onError: (err) =>
          setError(apiErrorMessage(err, "Couldn't record the review. It may not have been submitted yet.")),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={alreadyReviewed ? "Update feedback" : "Add feedback"}
      footer={
        <SheetSaveBar
          label={alreadyReviewed ? "Update review" : "Mark as reviewed"}
          onPress={() => submit(false)}
          loading={review.isPending}
          error={error}
        />
      }
    >
      <View className="flex-col gap-4 pb-4">
        <Textarea
          accessibilityLabel="Feedback"
          placeholder="What did the student do well? What could be stronger?"
          value={feedback}
          onChangeText={onFeedback}
          className="min-h-32"
        />
        <Button variant="secondary" disabled={review.isPending} onPress={() => submit(true)}>
          Return for revision
        </Button>
      </View>
    </Sheet>
  );
}
