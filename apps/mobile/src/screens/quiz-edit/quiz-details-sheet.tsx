/**
 * The quiz's name (and, for paper, its max score) in a sheet with its own
 * Save, so the builder page has one action of its own: Publish (owner,
 * 2026-11-07: a Publish button at the top and a Save at the bottom was messy).
 */
import { useState } from "react";
import { updateQuizRequestSchema, type QuizAuthoringDetail } from "@space/shared";

import { Sheet, SheetSaveBar } from "../../design/ui/sheet";
import { useUpdateQuiz } from "../../hooks/use-quiz-authoring";
import { apiErrorMessage } from "../../lib/api-error";
import { firstErrorByField } from "../../lib/form-errors";
import { QuizSettings } from "./quiz-settings";

const MAX_SCORE_MESSAGE = "Max score must be a whole number from 1 to 1000.";

export function QuizDetailsSheet({
  quiz,
  open,
  onClose,
}: {
  quiz: QuizAuthoringDetail;
  open: boolean;
  onClose: () => void;
}) {
  const update = useUpdateQuiz(quiz.id);
  const [title, setTitle] = useState(quiz.title);
  const [maxScore, setMaxScore] = useState(String(quiz.maxScore));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const isPaper = quiz.kind === "PAPER";
  // The server trims, so a space-only edit changes nothing.
  const titleChanged = title.trim() !== quiz.title;
  const scoreLocked = quiz.gradeCount > 0;
  const scoreChanged = isPaper && !scoreLocked && maxScore !== String(quiz.maxScore);
  const dirty = titleChanged || scoreChanged;

  const close = () => {
    // Reopening starts from what is saved, not from an abandoned edit.
    setTitle(quiz.title);
    setMaxScore(String(quiz.maxScore));
    setErrors({});
    setSaveError(null);
    onClose();
  };

  const save = () => {
    if (!dirty) return close();
    const body: { title?: string; maxScore?: number } = {};
    if (titleChanged) body.title = title.trim();
    if (scoreChanged) body.maxScore = maxScore.trim() === "" ? Number.NaN : Number(maxScore);
    const parsed = updateQuizRequestSchema.safeParse(body);
    if (!parsed.success) {
      const byField = firstErrorByField(parsed.error);
      const next: Record<string, string> = {};
      if ("title" in byField) next.title = "Enter a title.";
      if ("maxScore" in byField) next.maxScore = MAX_SCORE_MESSAGE;
      if (Object.keys(next).length === 0)
        next.form = Object.values(byField)[0] ?? "Check the quiz.";
      setErrors(next);
      return;
    }
    setErrors({});
    setSaveError(null);
    update.mutate(body, {
      onSuccess: onClose,
      onError: (err) => setSaveError(apiErrorMessage(err, "Couldn't save the quiz.")),
    });
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Quiz details"
      footer={
        <SheetSaveBar
          label="Save"
          onPress={save}
          loading={update.isPending}
          error={saveError ?? errors.form}
        />
      }
    >
      <QuizSettings
        kind={quiz.kind}
        title={title}
        maxScore={maxScore}
        locked={scoreLocked}
        errors={errors}
        onTitle={setTitle}
        onMaxScore={setMaxScore}
      />
    </Sheet>
  );
}
