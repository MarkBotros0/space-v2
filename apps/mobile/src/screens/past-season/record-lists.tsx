/** The three lists behind a finished season. Every status is a word on a chip. */
import { useRouter } from "expo-router";
import { FileText } from "lucide-react-native";
import type { SeasonRecord } from "@space/shared";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { EmptyState, GroupedList, ListRow, StatusChip, statusChip } from "../../design/ui";
import { formatDayKey, formatDate } from "../../lib/format";

export function AssignmentsList({ record }: { record: SeasonRecord }) {
  const router = useRouter();
  if (record.assignments.length === 0) {
    return <EmptyState icon={FileText} title="No assignments" description="This season had no assignments for you." />;
  }
  return (
    <GroupedList>
      {record.assignments.map((a, index) => (
        <ListRow
          key={a.id}
          index={index}
          title={a.title}
          titleLines={2}
          subtitle={a.dueOrgDay ? `Due ${formatDayKey(a.dueOrgDay)}` : undefined}
          trailing={
            a.status === "PENDING" ? (
              <StatusChip tone="neutral" label="Not submitted" />
            ) : (
              <StatusChip {...statusChip("submission", a.status)} />
            )
          }
          chevron
          onPress={() => router.push({ pathname: "/assignment/[id]", params: { id: String(a.id) } })}
        />
      ))}
    </GroupedList>
  );
}

const QUIZ_CHIP = {
  NOT_TAKEN: { tone: "neutral", label: "Not taken" },
  IN_PROGRESS: { tone: "neutral", label: "Not finished" },
  SUBMITTED: { tone: "neutral", label: "Awaiting grading" },
  GRADED: { tone: "ok", label: "Graded" },
} as const;

export function QuizzesList({ record }: { record: SeasonRecord }) {
  const router = useRouter();
  if (record.quizzes.length === 0) {
    return <EmptyState icon={NAV_ICONS.quizzes} title="No quizzes" description="This season had no quizzes for you." />;
  }
  return (
    <GroupedList>
      {record.quizzes.map((q, index) => (
        <ListRow
          key={`${q.kind}-${q.id}`}
          index={index}
          title={q.title}
          titleLines={2}
          subtitle={q.score !== null ? `Score: ${q.score}` : undefined}
          trailing={<StatusChip {...QUIZ_CHIP[q.status]} />}
          // A paper quiz has no screen of its own, as in Work.
          chevron={q.kind === "ONLINE"}
          onPress={
            q.kind === "ONLINE"
              ? () => router.push({ pathname: "/quiz/[id]", params: { id: String(q.id) } })
              : undefined
          }
        />
      ))}
    </GroupedList>
  );
}

export function AttendanceList({ record }: { record: SeasonRecord }) {
  if (record.attendance.length === 0) {
    return <EmptyState icon={NAV_ICONS.attendance} title="No sessions" description="This season had no sessions." />;
  }
  return (
    <GroupedList>
      {record.attendance.map((s, index) => (
        <ListRow
          key={s.sessionId}
          index={index}
          title={s.title}
          titleLines={2}
          subtitle={formatDate(s.startsAt)}
          trailing={
            s.status ? (
              <StatusChip {...statusChip("attendance", s.status)} />
            ) : (
              <StatusChip tone="neutral" label="Not recorded" />
            )
          }
        />
      ))}
    </GroupedList>
  );
}
