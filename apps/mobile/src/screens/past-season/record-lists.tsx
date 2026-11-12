/** The three lists behind a finished season. Every status is a word on a chip. */
import { useRouter } from "expo-router";
import { FileText } from "lucide-react-native";
import type { SeasonRecord } from "@space/shared";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { EmptyState, GroupedList, ListRow, StatusChip, statusChip, type ChipSpec } from "../../design/ui";
import { formatDayKey, formatDate, formatScore } from "../../lib/format";
import { plural } from "../../lib/plural";

type RecordAssignment = SeasonRecord["assignments"][number];

/** Where a finished season's assignment ended, in words: never submitted, done, or its review. */
function recordChip(a: RecordAssignment): ChipSpec {
  if (a.status === "PENDING" || a.status === "DRAFT") return { tone: "neutral", label: "Not submitted" };
  // Videos and a forum post are never reviewed: with no essay, submitted means done.
  if (a.status === "SUBMITTED" && !a.hasEssay) return { tone: "ok", label: "Done" };
  return statusChip("submission", a.status);
}

/** How far through its parts it got, for one left unsubmitted: "2 of 3 parts done". */
function partsLine(a: RecordAssignment): string | undefined {
  if (a.status !== "PENDING" && a.status !== "DRAFT") return undefined;
  return a.partsTotal > 0 ? `${a.partsDone} of ${plural(a.partsTotal, "part")} done` : undefined;
}

export function AssignmentsList({ record }: { record: SeasonRecord }) {
  const router = useRouter();
  if (record.assignments.length === 0) {
    return <EmptyState icon={FileText} title="No assignments" description="This season had no assignments for you." />;
  }
  return (
    <GroupedList>
      {record.assignments.map((a) => (
        <ListRow
          key={a.id}
          title={a.title}
          titleLines={2}
          detail={partsLine(a)}
          subtitle={a.dueOrgDay ? `Due ${formatDayKey(a.dueOrgDay)}` : undefined}
          trailing={<StatusChip {...recordChip(a)} />}
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
  SUBMITTED: { tone: "neutral", label: "Awaiting marking" },
  GRADED: { tone: "ok", label: "Graded" },
} as const;

type RecordQuiz = SeasonRecord["quizzes"][number];

function quizSubtitle(q: RecordQuiz): string | undefined {
  if (q.score === null) return undefined;
  const score = `Score: ${formatScore(q.score)}`;
  return q.adminScore?.notes ? `${score}\n${q.adminScore.notes}` : score;
}

export function QuizzesList({ record }: { record: SeasonRecord }) {
  const router = useRouter();
  if (record.quizzes.length === 0) {
    return <EmptyState icon={NAV_ICONS.quizzes} title="No quizzes" description="This season had no quizzes for you." />;
  }
  return (
    <GroupedList>
      {record.quizzes.map((q) => (
        <ListRow
          key={`${q.kind}-${q.id}`}
          title={q.title}
          titleLines={2}
          // The admin's score says whose it is, and its note follows on its own line (as in Work).
          {...(q.adminScore ? { detail: "Score entered by your admin" } : {})}
          subtitle={quizSubtitle(q)}
          subtitleLines={null}
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
      {record.attendance.map((s) => (
        <ListRow
          key={s.sessionId}
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
