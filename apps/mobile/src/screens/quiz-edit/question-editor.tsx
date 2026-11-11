import { useState } from "react";
import { View } from "react-native";
import {
  quizQuestionRequestSchema,
  type QuizQuestionAuthoring,
  type QuizQuestionInput,
  type QuizQuestionType,
} from "@space/shared";

import { textDirection } from "../../design/lib/text-direction";
import { Button, ChoiceChip, FieldError, FormField, Input, Label, Text, Textarea } from "../../design/ui";
import { questionTypeLabel } from "../quiz-detail/questions";
import { ChoiceOptions } from "./editors/choice-options";
import { emptyDraft, fieldErrors, fromAuthoring, QUESTION_TYPES, switchType } from "./editors/editor-model";
import { FillBlankEditor } from "./editors/fill-blank-editor";
import { MatchingPairs } from "./editors/matching-pairs";
import { TrueFalseEditor } from "./editors/true-false-editor";

interface QuestionEditorProps {
  /** Present when editing; absent when adding. */
  initial?: QuizQuestionAuthoring;
  submitting: boolean;
  /** A server error from the caller's mutation, shown under the form. */
  serverError: string | null;
  onSubmit: (body: QuizQuestionInput) => void;
  onCancel: () => void;
}

function TypePicker({ value, onChange }: { value: QuizQuestionType; onChange: (t: QuizQuestionType) => void }) {
  return (
    <View className="flex-col gap-1.5">
      <Label>Question type</Label>
      <View className="flex-row flex-wrap gap-2">
        {QUESTION_TYPES.map((t) => (
          <ChoiceChip
            key={t}
            label={questionTypeLabel({ type: t })}
            selected={value === t}
            onPress={() => onChange(t)}
          />
        ))}
      </View>
    </View>
  );
}

/** What the chosen type asks for under the prompt. */
function TypeBody({
  draft,
  errors,
  onDraft,
}: {
  draft: QuizQuestionInput;
  errors: Record<string, string>;
  onDraft: (d: QuizQuestionInput) => void;
}) {
  switch (draft.type) {
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE":
      return (
        <ChoiceOptions
          type={draft.type}
          options={draft.options}
          errors={errors}
          onChange={(options) => onDraft({ ...draft, options })}
        />
      );
    case "TRUE_FALSE":
      return <TrueFalseEditor correct={draft.correct} onChange={(correct) => onDraft({ ...draft, correct })} />;
    case "MATCHING":
      return <MatchingPairs pairs={draft.pairs} errors={errors} onChange={(pairs) => onDraft({ ...draft, pairs })} />;
    case "FILL_BLANK":
      return (
        <FillBlankEditor
          prompt={draft.prompt}
          answers={draft.answers}
          errors={errors}
          onChange={(next) => onDraft({ ...draft, ...next })}
        />
      );
    case "ESSAY":
      return (
        <Text variant="caption" className="text-muted-foreground">
          Students write an answer; a leader marks it right or wrong.
        </Text>
      );
  }
}

/**
 * One form for add and edit, for all six question types. Validated with the
 * SAME shared schema the server parses, and each message is shown at the field
 * it names ("Mark exactly one correct answer." under the options).
 */
export function QuestionEditor({ initial, submitting, serverError, onSubmit, onCancel }: QuestionEditorProps) {
  const [draft, setDraft] = useState<QuizQuestionInput>(() =>
    initial ? fromAuthoring(initial) : emptyDraft("SINGLE_CHOICE"),
  );
  const [points, setPoints] = useState(initial ? String(initial.points) : "1");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const changeType = (type: QuizQuestionType) => {
    setErrors({});
    setDraft((d) => switchType(d, type));
  };

  const submit = () => {
    const body: QuizQuestionInput = { ...draft, points: points.trim() === "" ? Number.NaN : Number(points) };
    const parsed = quizQuestionRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues, draft.type));
      return;
    }
    setErrors({});
    onSubmit(body);
  };

  return (
    <View className="flex-col gap-4 rounded-group border border-separator bg-surface p-4">
      <TypePicker value={draft.type} onChange={changeType} />

      {/* Fill in the blank writes its sentence in its own editor, beside Insert blank. */}
      {draft.type === "FILL_BLANK" ? null : (
        <FormField label="Question" error={errors.prompt}>
          <Textarea
            accessibilityLabel="Question prompt"
            value={draft.prompt}
            onChangeText={(prompt) => setDraft((d) => ({ ...d, prompt }))}
            placeholder="What is…?"
            direction={textDirection(draft.prompt)}
            className="min-h-16"
          />
        </FormField>
      )}

      <TypeBody draft={draft} errors={errors} onDraft={setDraft} />

      <FormField label="Points" description="A whole number from 1 to 100." error={errors.points}>
        <Input
          accessibilityLabel="Points"
          value={points}
          onChangeText={setPoints}
          keyboardType="number-pad"
          className="w-24"
        />
      </FormField>

      <FieldError>{errors.form ?? serverError ?? undefined}</FieldError>

      <View className="flex-row flex-wrap gap-2">
        <Button size="sm" disabled={submitting} onPress={submit}>
          {submitting ? "Saving…" : initial ? "Save" : "Add question"}
        </Button>
        <Button variant="plain" size="sm" disabled={submitting} onPress={onCancel}>
          Cancel
        </Button>
      </View>
    </View>
  );
}
