import { useEffect, useState } from "react";
import { View } from "react-native";

import { haptic } from "../../design/motion";
import { FormField } from "../../design/ui/form-field";
import { Sheet, SheetSaveBar } from "../../design/ui/sheet";
import { Textarea } from "../../design/ui/textarea";
import { useReviewEssay } from "../../hooks/use-submission";
import { apiErrorMessage } from "../../lib/api-error";

export type Verdict = "reviewed" | "return";

/** The server's own words for a return without a note (shared reviewEssayRequestSchema). */
const NEEDS_NOTE = "Say what to change";

const COPY = {
  reviewed: {
    field: "Feedback",
    placeholder: "What did the student do well? What could be stronger?",
    hint: "Feedback is optional. The student sees it with their essay.",
  },
  return: {
    field: "What to change",
    placeholder: "Tell the student what to change before they hand it in again.",
    hint: "The student sees this note and can change the essay and hand it in again.",
  },
} as const;

/**
 * One verdict on one essay. Mark reviewed takes optional feedback; Return needs
 * a note, so its button stays disabled until there is one (the server refuses
 * a blank one too). The parent owns the text, so dismissing keeps what was
 * typed. Marking reviewed keeps the reviewer on the page (v1, B3-9); a return
 * leaves, since the essay is the student's again.
 */
export function FeedbackSheet({
  open,
  verdict,
  onClose,
  publicId,
  alreadyReviewed,
  text,
  onText,
  onReturned,
}: {
  open: boolean;
  verdict: Verdict;
  onClose: () => void;
  publicId: string;
  alreadyReviewed: boolean;
  text: string;
  onText: (value: string) => void;
  onReturned: () => void;
}) {
  const review = useReviewEssay(publicId);
  const [error, setError] = useState<string | null>(null);
  // A failure belongs to the visit that caused it: a reopened sheet starts clean.
  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const copy = COPY[verdict];
  const returning = verdict === "return";
  const missingNote = returning && text.trim() === "";
  const label = returning ? "Return" : alreadyReviewed ? "Update feedback" : "Mark reviewed";

  const submit = () => {
    if (missingNote) return;
    setError(null);
    review.mutate(
      { action: verdict, feedback: text.trim() === "" ? null : text },
      {
        onSuccess: () => {
          haptic("success");
          onClose();
          if (returning) onReturned();
        },
        onError: (err) =>
          setError(apiErrorMessage(err, "Couldn't record the review. Check your connection and try again.")),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={returning ? "Return to the student" : label}
      footer={
        <SheetSaveBar
          label={label}
          onPress={submit}
          loading={review.isPending}
          disabled={missingNote || review.isPending}
          disabledReason={missingNote ? NEEDS_NOTE : undefined}
          hint={missingNote ? NEEDS_NOTE : copy.hint}
          error={error}
        />
      }
    >
      <View className="flex-col gap-4 pb-4">
        <FormField label={copy.field} required={returning}>
          <Textarea
            accessibilityLabel={copy.field}
            placeholder={copy.placeholder}
            value={text}
            onChangeText={onText}
            className="min-h-32"
          />
        </FormField>
      </View>
    </Sheet>
  );
}
