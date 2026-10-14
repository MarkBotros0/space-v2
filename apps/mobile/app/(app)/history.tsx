import { History } from "lucide-react-native";
import { View } from "react-native";

import { PageTitle } from "../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import { SeasonHistory } from "../../src/design/students/season-history";
import { EmptyState } from "../../src/design/ui";
import { useSeasonHistory } from "../../src/hooks/use-self-service";
import { useSessionStore } from "../../src/store/session";

/**
 * /history — STUDENT (sidebar) and ALUMNI (tab). One screen for v1's two
 * pages (spec 02 §9): the only difference was whether the current season is
 * excluded, and the server decides that from the token (Plan 11 Decision 3).
 * Privacy-critical (R34): the contract carries attendance % and curriculum
 * only, and its schema is strict, so nothing else can reach this screen.
 */
export default function HistoryScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const graduationYear = useSessionStore((s) => s.scopes?.graduationYear ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const isStudent = role === "STUDENT";
  const isAlumnus = isStudent && graduationYear !== null;
  const { data, isPending, isError, refetch, isRefetching } = useSeasonHistory(activeSeasonId, isStudent);

  if (!isStudent) {
    return (
      <ShellFrame>
        <View className="flex-col gap-3">
          <PageTitle title="History" />
          <EmptyState icon={History} title="History" description="Season history is for students and alumni." />
        </View>
      </ShellFrame>
    );
  }

  return (
    <ShellFrame onRefresh={() => void refetch()} refreshing={isRefetching}>
      <View className="flex-col gap-3">
        <PageTitle
          title={isAlumnus ? "My History" : "History"}
          subtitle={isAlumnus ? "The seasons you journeyed through" : "Seasons you've participated in"}
        />
        {isPending ? (
          <RouteSkeleton />
        ) : isError ? (
          <RouteError onRetry={() => void refetch()} />
        ) : (
          <SeasonHistory
            rows={data}
            emptyDescription={
              isAlumnus ? "Your completed seasons will appear here." : "Once you complete a season, it'll appear here."
            }
          />
        )}
      </View>
    </ShellFrame>
  );
}
