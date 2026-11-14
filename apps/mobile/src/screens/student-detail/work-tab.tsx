/**
 * The Work section of a student's page, for staff (owner 2026-11-14: replaces Submissions; "the
 * assignment already includes the submission"): this season's assignments and quizzes, each with
 * one chip saying what the student did, and each opening a pop-up with the parts (and the essay
 * inside) or the score. Not submitted assignments and the lowest quizzes come first, as the
 * progress read orders them.
 */
import { useState } from "react";
import { View } from "react-native";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { InlineError } from "../../design/layout/route-states";
import { EmptyState, GroupedList, ListRow, Skeleton, StatusChip } from "../../design/ui";
import { isNoSeasonError } from "../../hooks/use-engagement";
import { useStudentProgress } from "../../hooks/use-season-passing";
import { formatDate } from "../../lib/format";
import { assignmentStanding } from "./progress-model";
import { WorkItemSheet, type WorkItem } from "./work-item-sheet";
import { quizChip } from "./work-model";

export function StudentWorkTab({ studentId, studentName }: { studentId: number; studentName: string }) {
  const q = useStudentProgress(studentId);
  const [item, setItem] = useState<WorkItem | null>(null);

  if (q.isError && isNoSeasonError(q.error)) {
    return <EmptyState icon={NAV_ICONS.assignments} title="No season" description="They aren't in a season now." />;
  }
  if (q.isPending) {
    return (
      <View testID="student-work-loading" className="flex-col gap-2">
        <Skeleton height={52} />
        <Skeleton height={52} />
      </View>
    );
  }
  if (!q.data) return <InlineError message="Couldn't load their work." onRetry={() => void q.refetch()} />;

  const p = q.data;
  if (p.assignments.length === 0 && p.quizzes.length === 0) {
    return (
      <EmptyState
        icon={NAV_ICONS.assignments}
        title="No work yet"
        description="Assignments and quizzes of this season appear here."
      />
    );
  }
  return (
    <View className="flex-col gap-4">
      {p.assignments.length > 0 ? (
        <GroupedList header={`Assignments (${p.assignments.length})`}>
          {p.assignments.map((a) => {
            const standing = assignmentStanding(a);
            return (
              <ListRow
                key={a.id}
                title={a.title}
                titleLines={2}
                subtitle={a.dueAt ? `Due ${formatDate(a.dueAt)}` : undefined}
                trailing={<StatusChip tone={standing.tone} label={standing.label} />}
                trailingPlacement="below"
                chevron
                onPress={() => setItem({ kind: "assignment", id: a.id })}
              />
            );
          })}
        </GroupedList>
      ) : null}
      {p.quizzes.length > 0 ? (
        <GroupedList header={`Quizzes (${p.quizzes.length})`}>
          {p.quizzes.map((quiz) => {
            const chip = quizChip(quiz);
            return (
              <ListRow
                key={quiz.id}
                title={quiz.title}
                titleLines={2}
                subtitle={quiz.kind === "PAPER" ? "Paper quiz" : "Online quiz"}
                trailing={<StatusChip tone={chip.tone} label={chip.label} />}
                trailingPlacement="below"
                chevron
                onPress={() => setItem({ kind: "quiz", id: quiz.id })}
              />
            );
          })}
        </GroupedList>
      ) : null}
      <WorkItemSheet
        progress={p}
        item={item}
        studentId={studentId}
        studentName={studentName}
        onClose={() => setItem(null)}
      />
    </View>
  );
}
