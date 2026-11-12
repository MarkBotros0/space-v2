/**
 * Staff mark an assignment as submitted for a student who did it outside the app, or undo that
 * (docs/rules/assignments.md; spec 2026-11-12 "Staff mark an assignment as submitted"). The sheet
 * is the confirm: it says what the mark means before anything is sent, so no second modal opens.
 * The season's admin, a super or the student's own leader get here, on an active season; the
 * server is the gate and its refusal (season_finished, work_changed) is shown in the bar.
 * Reused on the student's page, where the confirm sits inside its progress sheet (useStaffMarkAction, StaffMarkBody).
 */
import { useEffect, useState } from "react";
import { View } from "react-native";

import { haptic } from "../../design/motion";
import { Sheet, SheetSaveBar, Text, toast } from "../../design/ui";
import { useMarkSubmitted, useUndoMarkSubmitted } from "../../hooks/use-assignment-writes";
import { apiErrorMessage } from "../../lib/api-error";
import { markedLine } from "./progress-model";

type StaffMarkStudent = { userId: number; name: string };
type StaffMarkSummary = { markedByName: string | null };

type Props = {
  /** The student to mark; null closes the sheet. */
  student: StaffMarkStudent | null;
  /** Their mark, when they have one: the sheet then offers Undo. */
  mark: StaffMarkSummary | null;
  assignmentId: number;
  onClose: () => void;
};

const sameShown = (
  a: { student: StaffMarkStudent | null; mark: StaffMarkSummary | null },
  student: StaffMarkStudent,
  mark: StaffMarkSummary | null,
) =>
  a.student?.userId === student.userId &&
  a.student.name === student.name &&
  (a.mark === null) === (mark === null) &&
  a.mark?.markedByName === mark?.markedByName;

/** The last student shown, by value, kept while the sheet fades out after `student` goes null. */
function useLastShown(student: StaffMarkStudent | null, mark: StaffMarkSummary | null) {
  const [shown, setShown] = useState({ student, mark });
  if (student !== null && !sameShown(shown, student, mark)) setShown({ student, mark });
  return shown;
}

/** Mark or undo for the student shown, with the refusal kept for the bar. */
export function useStaffMarkAction(assignmentId: number, userId: number | null, onClose: () => void) {
  const markIt = useMarkSubmitted(assignmentId);
  const undo = useUndoMarkSubmitted(assignmentId);
  const [error, setError] = useState<string | null>(null);
  const pending = markIt.isPending || undo.isPending;

  // A refusal belongs to the visit that caused it: a reopened sheet starts clean.
  useEffect(() => {
    if (userId !== null) setError(null);
  }, [userId]);

  const run = (studentUserId: number, marked: boolean) => {
    if (pending) return;
    setError(null);
    const done = (message: string) => {
      haptic("light");
      toast.success(message);
      onClose();
    };
    const failed = (fallback: string) => (err: unknown) => setError(apiErrorMessage(err, fallback));
    if (marked) {
      undo.mutate(
        { studentUserId },
        { onSuccess: () => done("Mark undone."), onError: failed("Couldn't undo the mark.") },
      );
    } else {
      markIt.mutate(
        { studentUserId },
        { onSuccess: () => done("Marked as submitted."), onError: failed("Couldn't mark it as submitted.") },
      );
    }
  };
  return { run, pending, error };
}

export function StaffMarkBody({ name, mark }: { name: string; mark: StaffMarkSummary | null }) {
  return (
    <View className="flex-col gap-2 pb-4">
      {mark !== null ? (
        <>
          <Text variant="headline">{markedLine(mark.markedByName)}</Text>
          <Text variant="subhead" className="text-muted-foreground">
            Undo if this was a mistake. It counts as not submitted again.
          </Text>
        </>
      ) : (
        <Text variant="body">{`Use this when ${name} did it outside the app. It counts as submitted everywhere.`}</Text>
      )}
    </View>
  );
}

export function StaffMarkSheet({ student, mark, assignmentId, onClose }: Props) {
  const shown = useLastShown(student, mark);
  const { run, pending, error } = useStaffMarkAction(assignmentId, student?.userId ?? null, onClose);
  const name = shown.student?.name ?? "this student";
  const marked = shown.mark !== null;
  const target = shown.student;

  return (
    <Sheet
      open={student !== null}
      onClose={onClose}
      title={name}
      footer={
        <SheetSaveBar
          label={marked ? "Undo, not submitted" : "Mark as submitted"}
          variant={marked ? "destructive" : "primary"}
          onPress={() => target !== null && run(target.userId, marked)}
          loading={pending}
          disabled={pending}
          error={error}
          secondary={{ label: "Cancel", onPress: onClose, disabled: pending }}
          beside
        />
      }
    >
      <StaffMarkBody name={name} mark={shown.mark} />
    </Sheet>
  );
}
