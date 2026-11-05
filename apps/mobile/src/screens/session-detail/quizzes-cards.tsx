import { View } from "react-native";
import { useRouter } from "expo-router";

import { NavIcon } from "../../design/icons/nav-icon";
import { InlineError } from "../../design/layout/route-states";
import {
  Badge,
  Button as ButtonV1,
  Card as CardV1,
  CardContent,
  CardHeader,
  CardTitle,
  Text as TextV1,
} from "../../design/ui";
import { GroupedList, ListRow, ListSectionHeader } from "../../design/ui/grouped-list";
import { useSessionQuizzes } from "../../hooks/use-session-quizzes";

const QUIZZES_ERROR = "Couldn't load this session's quizzes.";

/** One quiz row: a divider above every row but the first, no outer padding at either end. */
function rowClass(i: number, count: number): string {
  return `flex-row items-center justify-between gap-3 py-2 ${i === 0 ? "pt-0" : "border-t border-border"} ${i === count - 1 ? "pb-0" : ""}`;
}

/** v1 leader page: the session's quizzes as rows into grading (shown only when there are any). */
export function LeaderQuizzesCard({ sessionId }: { sessionId: number }) {
  const router = useRouter();
  const quizzes = useSessionQuizzes(sessionId, true);
  if (!quizzes.isError && (quizzes.isPending || quizzes.data.length === 0)) return null;
  if (quizzes.isError) {
    return (
      <View className="flex-col gap-1">
        <ListSectionHeader>Quizzes</ListSectionHeader>
        <InlineError message={QUIZZES_ERROR} onRetry={() => void quizzes.refetch()} />
      </View>
    );
  }
  return (
    <GroupedList header="Quizzes">
      {quizzes.data.map((q, i) => (
        <ListRow
          key={q.id}
          index={i}
          title={q.title}
          titleLines={2}
          // "· Draft" is v2's: an unpublished online quiz has nothing to grade yet.
          subtitle={
            q.kind === "ONLINE" && q.publishedAt === null
              ? `Max score: ${q.maxScore} · Draft`
              : `Max score: ${q.maxScore}`
          }
          chevron
          onPress={() => router.push({ pathname: "/quiz/[id]/grade", params: { id: String(q.id) } })}
        />
      ))}
    </GroupedList>
  );
}

/** The session's quizzes on the admin page: title, kind and state badges, Edit and Grade links (v1). */
export function AdminQuizzesCard({
  sessionId,
  seasonId,
  canAuthor,
}: {
  sessionId: number;
  seasonId: number;
  canAuthor: boolean;
}) {
  const router = useRouter();
  const quizzes = useSessionQuizzes(sessionId, true);
  return (
    <CardV1>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-2">
          <NavIcon name="quizzes" size={16} className="text-brand-teal-700 dark:text-brand-teal-400" />
          <CardTitle className="text-base">Quizzes</CardTitle>
        </View>
        {/* V2-ONLY: v1's inline "+ Add quiz" form; v2 opens the new-quiz screen. */}
        {canAuthor ? (
          <ButtonV1
            variant="outline"
            size="sm"
            onPress={() =>
              // v1 always created the quiz on this session, in this session's
              // season — never the caller's current one.
              router.push({
                pathname: "/quiz/new",
                params: { sessionId: String(sessionId), seasonId: String(seasonId) },
              })
            }
          >
            + Add quiz
          </ButtonV1>
        ) : null}
      </CardHeader>
      <CardContent>
        {quizzes.isPending ? (
          <TextV1 className="text-sm text-muted-foreground">Loading…</TextV1>
        ) : quizzes.isError ? (
          <InlineError message={QUIZZES_ERROR} onRetry={() => void quizzes.refetch()} />
        ) : quizzes.data.length === 0 ? (
          <TextV1 className="text-sm text-muted-foreground">
            No quizzes for this session yet.
          </TextV1>
        ) : (
          quizzes.data.map((q, i, all) => (
            <View key={q.id} className={rowClass(i, all.length)}>
              <View className="min-w-0 flex-1">
                <View className="flex-row flex-wrap items-center gap-2">
                  <TextV1
                    numberOfLines={1}
                    className="shrink text-sm font-semibold text-brand-navy-900 dark:text-foreground"
                  >
                    {q.title}
                  </TextV1>
                  <Badge variant={q.kind === "ONLINE" ? "teal" : "outline"}>
                    {q.kind === "ONLINE" ? "Online" : "Paper"}
                  </Badge>
                  {q.kind === "ONLINE" ? (
                    <Badge variant={q.publishedAt ? "outline" : "warning"}>
                      {q.publishedAt ? "Published" : "Draft"}
                    </Badge>
                  ) : null}
                </View>
                <TextV1 className="text-xs text-muted-foreground">
                  {q.kind === "ONLINE"
                    ? `${q.questionCount} question${q.questionCount === 1 ? "" : "s"} · ${q.maxScore} pts`
                    : `Max score: ${q.maxScore}`}
                </TextV1>
              </View>
              <View className="shrink-0 flex-row gap-1">
                {canAuthor && q.kind === "ONLINE" ? (
                  <ButtonV1
                    variant="ghost"
                    size="sm"
                    onPress={() =>
                      router.push({ pathname: "/quiz/[id]/edit", params: { id: String(q.id) } })
                    }
                  >
                    Edit
                  </ButtonV1>
                ) : null}
                <ButtonV1
                  variant="ghost"
                  size="sm"
                  onPress={() =>
                    router.push({ pathname: "/quiz/[id]/grade", params: { id: String(q.id) } })
                  }
                >
                  Grade
                </ButtonV1>
              </View>
            </View>
          ))
        )}
      </CardContent>
    </CardV1>
  );
}
