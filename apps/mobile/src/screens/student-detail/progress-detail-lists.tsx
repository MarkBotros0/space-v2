/**
 * What each number on the Season progress card opens to (spec 2026-11-12 "Progress for staff"):
 * the sessions summed up, the assignments with missing ones first, the quizzes lowest score first.
 * The actions are the ones that already exist: Mark as submitted (and Undo) on an assignment,
 * Allow a retake on a quiz. Every standing is a word as well as a tone.
 */
import type { StudentProgress } from "@space/shared";
import { View } from "react-native";

import { Button, GroupedList, ListRow, StatusChip, Text } from "../../design/ui";
import { formatDate } from "../../lib/format";
import { plural } from "../../lib/plural";
import {
  NONE_THIS_SEASON,
  assignmentAction,
  assignmentMarkedBy,
  assignmentStanding,
  quizAction,
  quizLine,
} from "./progress-model";

export type ProgressAssignment = StudentProgress["assignments"][number];
type ProgressQuiz = StudentProgress["quizzes"][number];

function Note({ children }: { children: string }) {
  return (
    <Text variant="subhead" className="text-muted-foreground">
      {children}
    </Text>
  );
}

const ENDED = "This season has ended; its work can't change.";

export function AttendanceSummary({ progress }: { progress: StudentProgress }) {
  const { attended, total } = progress.numbers.attendance;
  if (total === 0) return <Note>{NONE_THIS_SEASON}</Note>;
  return (
    <View className="flex-col gap-3">
      <GroupedList>
        <ListRow title={`Attended ${plural(attended, "session")}`} />
        <ListRow title={`Missed ${plural(total - attended, "session")}`} />
      </GroupedList>
      <Note>
        Sessions since they joined the season, up to today. Late counts as attended. Every session is under Attendance
        on this page.
      </Note>
    </View>
  );
}

function AssignmentRow({
  assignment,
  canMark,
  onMark,
}: {
  assignment: ProgressAssignment;
  canMark: boolean;
  onMark: (a: ProgressAssignment) => void;
}) {
  const standing = assignmentStanding(assignment);
  const action = assignmentAction(assignment, canMark);
  return (
    <View testID="progress-assignment-row">
      <ListRow
        title={assignment.title}
        titleLines={2}
        detail={assignmentMarkedBy(assignment) ?? undefined}
        subtitle={assignment.dueAt ? `Due ${formatDate(assignment.dueAt)}` : undefined}
        footer={
          <>
            <StatusChip tone={standing.tone} label={standing.label} />
            {action ? (
              <Button
                variant={action === "undo" ? "plain" : "secondary"}
                size="sm"
                accessibilityLabel={
                  action === "undo" ? `Undo the mark on ${assignment.title}` : `Mark ${assignment.title} as submitted`
                }
                onPress={() => onMark(assignment)}
              >
                {action === "undo" ? "Undo" : "Mark as submitted"}
              </Button>
            ) : null}
          </>
        }
      />
    </View>
  );
}

export function AssignmentList({
  progress,
  onMark,
}: {
  progress: StudentProgress;
  onMark: (a: ProgressAssignment) => void;
}) {
  if (progress.assignments.length === 0) return <Note>{NONE_THIS_SEASON}</Note>;
  return (
    <View className="flex-col gap-3">
      {progress.seasonActive ? null : <Note>{ENDED}</Note>}
      <GroupedList>
        {progress.assignments.map((a) => (
          <AssignmentRow key={a.id} assignment={a} canMark={progress.canMark} onMark={onMark} />
        ))}
      </GroupedList>
    </View>
  );
}

function QuizRow({ quiz, seasonActive, onOpen }: { quiz: ProgressQuiz; seasonActive: boolean; onOpen: () => void }) {
  const action = quizAction(quiz, seasonActive);
  return (
    <View testID="progress-quiz-row">
      <ListRow
        title={quiz.title}
        titleLines={2}
        detail={quiz.kind === "PAPER" ? "Paper quiz" : "Online quiz"}
        subtitle={quizLine(quiz)}
        footer={
          action ? (
            <Button variant="secondary" size="sm" accessibilityLabel={`${action}, ${quiz.title}`} onPress={onOpen}>
              {action}
            </Button>
          ) : undefined
        }
      />
    </View>
  );
}

export function QuizList({ progress, onOpen }: { progress: StudentProgress; onOpen: (quizId: number) => void }) {
  if (progress.quizzes.length === 0) return <Note>{NONE_THIS_SEASON}</Note>;
  return (
    <View className="flex-col gap-3">
      {progress.seasonActive ? null : <Note>{ENDED}</Note>}
      <GroupedList>
        {progress.quizzes.map((q) => (
          <QuizRow key={q.id} quiz={q} seasonActive={progress.seasonActive} onOpen={() => onOpen(q.id)} />
        ))}
      </GroupedList>
    </View>
  );
}
