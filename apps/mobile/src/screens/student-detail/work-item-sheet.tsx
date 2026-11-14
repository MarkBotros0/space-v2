/**
 * One assignment or quiz from a student's Work section, as a pop-up (owner 2026-11-14: "the
 * assignment already includes the submission; inside the assignment I can see the essay").
 * An assignment lists its parts with the student's state on each; a handed-in essay opens to read
 * and review. Mark as submitted (and Undo) swaps this same sheet to the confirm, as the progress
 * sheet does, never a second modal. A quiz shows its score and the way to a better one.
 */
import type { StudentProgress } from "@space/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { InlineError } from "../../design/layout/route-states";
import { Button, GroupedList, ListRow, Sheet, SheetSaveBar, Skeleton, StatusChip, Text } from "../../design/ui";
import { useAssignmentDetail, useAssignmentProgress } from "../../hooks/use-assignments";
import { formatDate } from "../../lib/format";
import { progressLine } from "../assignment-detail/progress-model";
import { StaffMarkBody, useStaffMarkAction } from "../assignment-detail/staff-mark-sheet";
import { assignmentAction, assignmentStanding, quizAction, quizLine } from "./progress-model";
import { partLines, quizChip } from "./work-model";

type ProgressAssignment = StudentProgress["assignments"][number];
type ProgressQuiz = StudentProgress["quizzes"][number];

export type WorkItem = { kind: "assignment"; id: number } | { kind: "quiz"; id: number };

const ENDED = "This season has ended; its work can't change.";

function Muted({ children }: { children: string }) {
  return (
    <Text variant="subhead" className="text-muted-foreground">
      {children}
    </Text>
  );
}

function AssignmentBody({
  assignment,
  studentId,
  seasonActive,
  onOpenEssay,
}: {
  assignment: ProgressAssignment;
  studentId: number;
  seasonActive: boolean;
  onOpenEssay: (publicId: string) => void;
}) {
  const detail = useAssignmentDetail(assignment.id);
  const progress = useAssignmentProgress(assignment.id);
  const standing = assignmentStanding(assignment);
  const head = (
    <View className="flex-row flex-wrap items-center gap-2">
      <StatusChip tone={standing.tone} label={standing.label} />
      {assignment.dueAt ? <Muted>{`Due ${formatDate(assignment.dueAt)}`}</Muted> : null}
    </View>
  );
  if (detail.isPending || progress.isPending) {
    return (
      <View testID="work-item-loading" className="flex-col gap-3">
        {head}
        <Skeleton height={52} />
        <Skeleton height={52} />
      </View>
    );
  }
  if (!detail.data || !progress.data) {
    return (
      <View className="flex-col gap-3">
        {head}
        <InlineError
          message="Couldn't load this assignment."
          onRetry={() => {
            void detail.refetch();
            void progress.refetch();
          }}
        />
      </View>
    );
  }
  const parts = detail.data.parts;
  const row = progress.data.rows.find((r) => r.studentUserId === studentId);
  const lines = partLines(parts, row);
  return (
    <View className="flex-col gap-3">
      {head}
      {row ? <Text variant="body">{progressLine(parts, row)}</Text> : null}
      {seasonActive ? null : <Muted>{ENDED}</Muted>}
      <GroupedList header="Parts">
        {lines.map((line) => (
          <ListRow
            key={line.partId}
            title={line.title}
            titleLines={2}
            subtitle={line.name}
            trailing={<StatusChip tone={line.chip.tone} label={line.chip.label} />}
            trailingPlacement="below"
            chevron={line.essayPublicId !== null}
            onPress={line.essayPublicId !== null ? () => onOpenEssay(line.essayPublicId!) : undefined}
          />
        ))}
      </GroupedList>
      {lines.some((l) => l.essayPublicId !== null) ? <Muted>Open an essay to read and review it.</Muted> : null}
    </View>
  );
}

function QuizBody({ quiz, seasonActive, onOpen }: { quiz: ProgressQuiz; seasonActive: boolean; onOpen: () => void }) {
  const chip = quizChip(quiz);
  const action = quizAction(quiz, seasonActive);
  return (
    <View className="flex-col gap-3 pb-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <StatusChip tone={chip.tone} label={chip.label} />
        <Muted>{quiz.kind === "PAPER" ? "Paper quiz" : "Online quiz"}</Muted>
      </View>
      <Text variant="body">{quizLine(quiz)}</Text>
      {seasonActive ? null : <Muted>{ENDED}</Muted>}
      {action ? (
        <Button variant="secondary" onPress={onOpen}>
          {action}
        </Button>
      ) : null}
    </View>
  );
}

/** The last item shown, kept while the sheet slides away after `item` goes null. */
function useLastItem(item: WorkItem | null): WorkItem | null {
  const [shown, setShown] = useState<WorkItem | null>(item);
  if (item !== null && item !== shown) setShown(item);
  return shown;
}

export function WorkItemSheet({
  progress,
  item,
  studentId,
  studentName,
  onClose,
}: {
  progress: StudentProgress;
  item: WorkItem | null;
  studentId: number;
  studentName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const shown = useLastItem(item);
  const assignment = shown?.kind === "assignment" ? progress.assignments.find((a) => a.id === shown.id) : undefined;
  const quiz = shown?.kind === "quiz" ? progress.quizzes.find((q) => q.id === shown.id) : undefined;
  const [confirming, setConfirming] = useState(false);
  const back = () => setConfirming(false);
  const action = useStaffMarkAction(assignment?.id ?? 0, confirming ? studentId : null, back);

  // A reopened sheet starts on the item, not on a confirm left behind.
  useEffect(() => {
    if (item === null) setConfirming(false);
  }, [item]);

  const go = (push: () => void) => {
    onClose();
    push();
  };
  const markAction = assignment ? assignmentAction(assignment, progress.canMark) : null;
  const marked = assignment?.submitted === "staff";

  let footer;
  if (assignment && confirming) {
    footer = (
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
    );
  } else if (markAction) {
    footer = (
      <SheetSaveBar
        label={markAction === "undo" ? "Undo the mark" : "Mark as submitted"}
        variant={markAction === "undo" ? "destructive" : "primary"}
        onPress={() => setConfirming(true)}
      />
    );
  }

  let body = null;
  if (assignment && confirming) {
    body = (
      <StaffMarkBody
        name={studentName}
        mark={marked ? { markedByName: assignment.staffMark?.markedByName ?? null } : null}
      />
    );
  } else if (assignment) {
    body = (
      <AssignmentBody
        assignment={assignment}
        studentId={studentId}
        seasonActive={progress.seasonActive}
        onOpenEssay={(publicId) => go(() => router.push({ pathname: "/submission/[publicId]", params: { publicId } }))}
      />
    );
  } else if (quiz) {
    body = (
      <QuizBody
        quiz={quiz}
        seasonActive={progress.seasonActive}
        onOpen={() => go(() => router.push({ pathname: "/quiz/[id]/grade", params: { id: String(quiz.id) } }))}
      />
    );
  }

  return (
    <Sheet open={item !== null} onClose={onClose} title={assignment?.title ?? quiz?.title} footer={footer}>
      {body}
    </Sheet>
  );
}
