import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react-native";
import { View } from "react-native";
import type { QuizAuthoringDetail, QuizQuestionAuthoring } from "@space/shared";

import { QuestionEditor } from "./question-editor";
import { iconWithClassName } from "../../design/lib/icon";
import { Button, ConfirmDialog, ContentText, StatusChip, Text } from "../../design/ui";
import { useDeleteQuestion, useReorderQuestions, useUpdateQuestion } from "../../hooks/use-quiz-authoring";
import { apiErrorMessage } from "../../lib/api-error";
import { plural } from "../../lib/plural";
import { readablePrompt } from "../quiz-detail/blank-segments";
import { questionSummary } from "./editors/editor-model";

iconWithClassName(ChevronDown, ChevronUp, Pencil, Trash2);

export function QuestionRow({
  quiz,
  question,
  index,
  editable,
  onError,
  onEditingChange,
}: {
  quiz: QuizAuthoringDetail;
  question: QuizQuestionAuthoring;
  index: number;
  editable: boolean;
  onError: (m: string | null) => void;
  /** The builder blocks its Save while any question form is open. */
  onEditingChange: (editing: boolean) => void;
}) {
  const update = useUpdateQuestion(quiz.id);
  const remove = useDeleteQuestion(quiz.id);
  const reorder = useReorderQuestions(quiz.id);
  const [editing, setEditing] = useState(false);
  // Count open→closed transitions only, so an unmount mid-edit (the question was deleted
  // elsewhere and a refetch dropped the row) releases the builder's Save, and a second
  // "closed" report can never cancel out a different row's open form (final review I2).
  useEffect(() => {
    if (!editing) return;
    onEditingChange(true);
    return () => onEditingChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  const [confirming, setConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const n = index + 1;
  const ids = quiz.questions.map((q) => q.id);

  const move = (delta: -1 | 1) => {
    const target = index + delta;
    const next = [...ids];
    [next[index], next[target]] = [next[target] as number, next[index] as number];
    onError(null);
    reorder.mutate(next, { onError: (err) => onError(apiErrorMessage(err, "Couldn't reorder.")) });
  };

  const onDelete = () => {
    onError(null);
    remove.mutate(question.id, {
      onSuccess: () => setConfirming(false),
      onError: (err) => {
        setConfirming(false);
        onError(apiErrorMessage(err, "Couldn't delete the question."));
      },
    });
  };

  if (editing) {
    return (
      <QuestionEditor
        initial={question}
        submitting={update.isPending}
        serverError={serverError}
        onCancel={() => setEditing(false)}
        onSubmit={(body) =>
          update.mutate(
            { questionId: question.id, body },
            {
              onSuccess: () => setEditing(false),
              onError: (err) => setServerError(apiErrorMessage(err, "Couldn't save the question.")),
            },
          )
        }
      />
    );
  }

  const summary = questionSummary(question);

  return (
    <View className="flex-row items-start justify-between gap-3 rounded-group bg-surface p-4">
      <View className="min-w-0 flex-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="caption" className="font-bold text-muted-foreground">{`Q${n}`}</Text>
          <StatusChip tone={question.type === "ESSAY" ? "neutral" : "info"} label={summary.type} />
          <Text variant="caption" tabular className="text-muted-foreground">
            {plural(question.points, "pt")}
          </Text>
        </View>
        <ContentText variant="headline" className="mt-1">
          {readablePrompt(question.prompt)}
        </ContentText>
        {summary.count ? (
          <Text variant="caption" className="mt-0.5 text-muted-foreground">
            {summary.count}
          </Text>
        ) : null}
        {summary.key ? (
          <ContentText variant="caption" numberOfLines={2} className="mt-0.5 text-muted-foreground">
            {`Correct: ${summary.key}`}
          </ContentText>
        ) : null}
      </View>
      {editable ? (
        <View className="shrink-0 flex-row flex-wrap justify-end">
          {/* V2-ONLY: reorder (v1 had none; PATCH /quizzes/:id/order, spec 12). Only when the
              questions keep their order: a shuffled quiz has none to set (owner, 2026-11-13). */}
          {quiz.shuffleQuestions ? null : (
            <>
              <Button
                variant="plain"
                size="sm"
                accessibilityLabel={`Move question ${n} up`}
                disabled={index === 0 || reorder.isPending}
                onPress={() => move(-1)}
              >
                <ChevronUp size={16} className="text-foreground" />
              </Button>
              <Button
                variant="plain"
                size="sm"
                accessibilityLabel={`Move question ${n} down`}
                disabled={index === ids.length - 1 || reorder.isPending}
                onPress={() => move(1)}
              >
                <ChevronDown size={16} className="text-foreground" />
              </Button>
            </>
          )}
          <Button variant="plain" size="sm" accessibilityLabel={`Edit question ${n}`} onPress={() => setEditing(true)}>
            <Pencil size={16} className="text-foreground" />
          </Button>
          <Button
            variant="plain"
            size="sm"
            accessibilityLabel={`Delete question ${n}`}
            onPress={() => setConfirming(true)}
          >
            <Trash2 size={16} className="text-error-600" />
          </Button>
        </View>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete question?"
        description="This removes the question and any recorded answers. This cannot be undone."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={onDelete}
      />
    </View>
  );
}
