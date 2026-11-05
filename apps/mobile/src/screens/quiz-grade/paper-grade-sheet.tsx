import type { QuizGradeSheet } from "@space/shared";

import { QuizGradeFields } from "../../design/quizzes/quiz-grade-form";
import { Sheet, SheetSaveBar } from "../../design/ui/sheet";

type QuizGradeRow = QuizGradeSheet["rows"][number];

export type PaperDraft = { score: string; notes: string };

/** What a row shows before anyone has typed: the server's mark and note. */
export function seedDraft(row: QuizGradeRow): PaperDraft {
  return { score: row.score == null ? "" : String(row.score), notes: row.notes ?? "" };
}

/**
 * One student's mark in a bottom sheet. The drafts live in the screen, keyed
 * by student, so dismissing and reopening keeps what was typed.
 */
export function PaperGradeSheet({
  row,
  maxScore,
  open,
  onClose,
  draft,
  onDraft,
  onSave,
  saving,
  error,
}: {
  row: QuizGradeRow;
  maxScore: number;
  open: boolean;
  onClose: () => void;
  draft: PaperDraft;
  onDraft: (patch: Partial<PaperDraft>) => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
}) {
  const name = row.studentName ?? "Student";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Grade ${name}`}
      footer={<SheetSaveBar label="Save" onPress={onSave} loading={saving} />}
    >
      <QuizGradeFields
        name={name}
        maxScore={maxScore}
        score={draft.score}
        notes={draft.notes}
        onScore={(score) => onDraft({ score })}
        onNotes={(notes) => onDraft({ notes })}
        error={error}
      />
    </Sheet>
  );
}
