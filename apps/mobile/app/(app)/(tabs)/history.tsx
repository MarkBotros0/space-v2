import { isAlumnus, isStudyingAlumnus } from "@space/shared";
import { View } from "react-native";

import { NAV_ICONS } from "../../../src/design/icons/nav-icon";
import { PageTitle } from "../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { Screen } from "../../../src/design/layout/screen";
import { AlumniHistory } from "../../../src/screens/alumni/alumni-history";
import { SeasonHistory } from "../../../src/design/students/season-history";
import { EmptyState } from "../../../src/design/ui";
import { useSeasonHistory } from "../../../src/hooks/use-self-service";
import { useSessionStore } from "../../../src/store/session";

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
  // navFor's rule (shared): a graduated student, unless studying.
  const audience = role === null ? null : { role, graduationYear, activeSeasonId };
  const alumnusNotStudying = audience !== null && isAlumnus(audience) && !isStudyingAlumnus(audience);
  const query = useSeasonHistory(activeSeasonId, isStudent);
  const { data, isPending, isError, refetch, isRefetching } = query;

  if (alumnusNotStudying) return <AlumniHistory query={query} />;

  if (!isStudent) {
    return (
      <Screen>
        <View className="flex-col gap-3">
          <PageTitle title="History" />
          <EmptyState
            icon={NAV_ICONS.history}
            title="History"
            description="Season history is for students and alumni."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="History"
      subtitle="Seasons you've participated in"
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
    >
      {isPending ? (
        <RouteSkeleton />
      ) : isError ? (
        <RouteError onRetry={() => void refetch()} />
      ) : (
        <SeasonHistory rows={data} emptyDescription="Once you complete a season, it'll appear here." />
      )}
    </Screen>
  );
}
