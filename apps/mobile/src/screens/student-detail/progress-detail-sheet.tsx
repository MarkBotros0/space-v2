/**
 * One number of a student's Season progress, opened from the card: the sessions summed up, the
 * assignments, or the quizzes. Marking an assignment as submitted (or undoing a mark) swaps this
 * same sheet to the confirm, with the words and the action of the assignment page's StaffMarkSheet:
 * never a second modal over this one, which iOS can drop. Allow a retake closes the sheet and
 * opens the quiz's grading screen.
 */
import type { PassingNumberKey, StudentProgress } from "@space/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import { Sheet, SheetSaveBar } from "../../design/ui";
import { StaffMarkBody, useStaffMarkAction } from "../assignment-detail/staff-mark-sheet";
import { AssignmentList, AttendanceSummary, type ProgressAssignment, QuizList } from "./progress-detail-lists";

const TITLES: Record<PassingNumberKey, string> = {
  attendance: "Attendance",
  assignments: "Assignments",
  quizzes: "Quizzes",
};

type Props = {
  progress: StudentProgress;
  /** The number to show; null closes the sheet. */
  view: PassingNumberKey | null;
  studentId: number;
  studentName: string;
  onClose: () => void;
};

/** The last number shown, kept while the sheet fades out after `view` goes null. */
function useLastView(view: PassingNumberKey | null): PassingNumberKey {
  const [shown, setShown] = useState<PassingNumberKey>(view ?? "attendance");
  if (view !== null && view !== shown) setShown(view);
  return shown;
}

export function ProgressDetailSheet({ progress, view, studentId, studentName, onClose }: Props) {
  const router = useRouter();
  const shown = useLastView(view);
  const [target, setTarget] = useState<ProgressAssignment | null>(null);
  const back = () => setTarget(null);
  const action = useStaffMarkAction(target?.id ?? 0, target ? studentId : null, back);

  // A reopened sheet starts on its list, not on a confirm left behind.
  useEffect(() => {
    if (view === null) setTarget(null);
  }, [view]);

  const openQuiz = (quizId: number) => {
    onClose();
    router.push({ pathname: "/quiz/[id]/grade", params: { id: String(quizId) } });
  };

  const marked = target?.submitted === "staff";
  const footer = target ? (
    <SheetSaveBar
      label={marked ? "Undo, not submitted" : "Mark as submitted"}
      variant={marked ? "destructive" : "primary"}
      onPress={() => action.run(studentId, marked)}
      loading={action.pending}
      disabled={action.pending}
      error={action.error}
      secondary={{ label: "Back", onPress: back, disabled: action.pending }}
      beside
    />
  ) : undefined;

  let body;
  if (target) {
    body = (
      <StaffMarkBody
        name={studentName}
        mark={marked ? { markedByName: target.staffMark?.markedByName ?? null } : null}
      />
    );
  } else if (shown === "attendance") {
    body = <AttendanceSummary progress={progress} />;
  } else if (shown === "assignments") {
    body = <AssignmentList progress={progress} onMark={setTarget} />;
  } else {
    body = <QuizList progress={progress} onOpen={openQuiz} />;
  }

  return (
    <Sheet open={view !== null} onClose={onClose} title={target ? target.title : TITLES[shown]} footer={footer}>
      {body}
    </Sheet>
  );
}
