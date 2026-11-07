import { useRouter } from "expo-router";
import { View } from "react-native";
import type { SeasonEndCheck } from "@space/shared";

import { EmptyState, GroupedList, ListRow, Text } from "../../design/ui";
import { formatDateTime } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="flex-col gap-2">
      <Text variant="headline" accessibilityRole="header">
        {title}
      </Text>
      <GroupedList>{children}</GroupedList>
    </View>
  );
}

/**
 * What stops the season from ending: submissions, quiz attempts and sessions
 * that still need a staff member. Each row opens the place to finish it. There
 * is deliberately no way past them: the server refuses the end too.
 */
export function BlockersList({ blockers }: { blockers: SeasonEndCheck["blockers"] }) {
  const router = useRouter();
  const { submissions, quizAttempts, attendance } = blockers;
  return (
    <View className="flex-col gap-5">
      <EmptyState
        tone="info"
        title="Finish these first"
        description="A season can't end while work is still waiting. Open each one, finish it, then come back."
      />
      {submissions.length > 0 ? (
        <Group title={`${plural(submissions.length, "submission", "submissions")} not reviewed`}>
          {submissions.map((s) => (
            <ListRow
              key={s.publicId}
              title={s.assignmentTitle}
              subtitle={s.studentName}
              chevron
              onPress={() => router.push({ pathname: "/submission/[publicId]", params: { publicId: s.publicId } })}
            />
          ))}
        </Group>
      ) : null}
      {quizAttempts.length > 0 ? (
        <Group title={`${plural(quizAttempts.length, "quiz attempt", "quiz attempts")} not graded`}>
          {quizAttempts.map((q) => (
            <ListRow
              key={q.attemptId}
              title={q.quizTitle}
              subtitle={q.studentName}
              chevron
              onPress={() => router.push({ pathname: "/quiz/[id]/grade", params: { id: String(q.quizId) } })}
            />
          ))}
        </Group>
      ) : null}
      {attendance.length > 0 ? (
        <Group title={`${plural(attendance.length, "session", "sessions")} without attendance`}>
          {attendance.map((a) => (
            <ListRow
              key={a.sessionId}
              title={a.title}
              subtitle={joinMeta([formatDateTime(a.startsAt), `${a.missing} not marked`])}
              chevron
              onPress={() => router.push({ pathname: "/session/[id]/attendance", params: { id: String(a.sessionId) } })}
            />
          ))}
        </Group>
      ) : null}
    </View>
  );
}
