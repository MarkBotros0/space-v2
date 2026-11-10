import { useRouter } from "expo-router";
import { View } from "react-native";
import type { QuizSummary } from "@space/shared";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { EmptyState } from "../../design/ui/empty-state";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { StatusChip, type ChipSpec } from "../../design/ui/status-chip";
import { useQuizList } from "../../hooks/use-quizzes";
import { useCurrentSeasonId } from "../../hooks/use-seasons";
import { formatDate, unbreakable } from "../../lib/format";
import { bySessionDate } from "../../lib/quiz-order";

/** v1's three-way graded state over the server's counts (C4, D10). */
function gradedChip(row: QuizSummary): ChipSpec {
  if (row.studentCount > 0 && row.gradedCount >= row.studentCount) return { tone: "ok", label: "Done" };
  if (row.gradedCount > 0) return { tone: "warn", label: "Partial" };
  return { tone: "neutral", label: "Pending" };
}

function subtitleOf(row: QuizSummary): string {
  const session =
    row.sessionTitle !== null ? `${row.sessionTitle} · ${unbreakable(formatDate(row.sessionDate))}` : "No session";
  // Each short unit is one unbreakable run, so the line breaks between them, never inside.
  const max = unbreakable(`Max ${row.maxScore} pts`);
  const graded = unbreakable(`${row.gradedCount}/${row.studentCount} graded`);
  return `${session} · ${max} · ${graded}`;
}

/**
 * LEADER — v1 app/leader/quizzes/page.tsx. Every row opens grading (spec 12
 * D12: the flat route has no orphan "#" links). Moved out of the Quizzes tab
 * (plan 02's route); the tab still picks it by role.
 */
export function LeaderQuizzes() {
  const router = useRouter();
  const current = useCurrentSeasonId();
  const seasonId = current.seasonId;
  const { data, isPending, isError, refetch, isRefetching } = useQuizList(seasonId);
  const rows = [...(data?.items ?? [])].sort(bySessionDate);

  let body;
  if (current.isPending || (seasonId !== null && isPending)) body = <RouteSkeleton />;
  else if (current.isError) body = <RouteError onRetry={current.refetch} />;
  else if (seasonId !== null && isError) body = <RouteError onRetry={() => void refetch()} />;
  else if (rows.length === 0)
    body = (
      <EmptyState
        icon={NAV_ICONS.quizzes}
        title="No quizzes yet"
        description="Quizzes created by your admin will appear here."
      />
    );
  else
    body = (
      <View className="flex-col gap-4">
        <GroupedList>
          {rows.map((row) => (
            <ListRow
              key={row.id}
              title={row.title}
              titleLines={2}
              subtitle={subtitleOf(row)}
              subtitleLines={3}
              trailing={<StatusChip {...gradedChip(row)} />}
              chevron
              onPress={() => router.push({ pathname: "/quiz/[id]/grade", params: { id: String(row.id) } })}
            />
          ))}
        </GroupedList>
      </View>
    );

  return (
    <Screen
      title="Quizzes"
      subtitle="Grade paper quizzes for your group"
      refreshing={isRefetching}
      onRefresh={() => (seasonId !== null ? void refetch() : current.refetch())}
    >
      {body}
    </Screen>
  );
}
