/**
 * The frame every finished-season screen shares: the season id from the route,
 * the one query, and the loading, error and not-found states. The body is given
 * the parsed record.
 */
import { useLocalSearchParams } from "expo-router";
import { SearchX } from "lucide-react-native";
import type { ReactNode } from "react";
import type { SeasonRecord } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { EmptyState } from "../../design/ui";
import { useSeasonRecord } from "../../hooks/use-self-service";
import { isNotFoundError } from "../../lib/api-error";
import { parsePositiveInt } from "../../lib/params";

export function useSeasonIdParam(): number | null {
  const { seasonId } = useLocalSearchParams<{ seasonId: string }>();
  return parsePositiveInt(seasonId);
}

function RecordQuery({
  seasonId,
  title,
  children,
}: {
  seasonId: number;
  title?: string;
  children: (record: SeasonRecord) => ReactNode;
}) {
  const { data, isPending, isError, error, refetch, isRefetching } = useSeasonRecord(seasonId);
  if (data !== undefined) {
    return (
      <Screen
        title={title ?? data.season.title}
        subtitle={title ? data.season.title : undefined}
        onRefresh={() => void refetch()}
        refreshing={isRefetching}
      >
        {children(data)}
      </Screen>
    );
  }
  return (
    <Screen title={title}>
      {isPending ? (
        <RouteSkeleton />
      ) : isNotFoundError(error) ? (
        <NotFound />
      ) : isError ? (
        <RouteError onRetry={() => void refetch()} />
      ) : null}
    </Screen>
  );
}

function NotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Season not found"
      description="You can only open seasons you have finished."
    />
  );
}

export function RecordScreen({
  title,
  children,
}: {
  /** Names the list; the season's own title then goes in the subtitle. Unset: the season's title. */
  title?: string;
  children: (record: SeasonRecord) => ReactNode;
}) {
  const seasonId = useSeasonIdParam();
  if (seasonId === null) {
    return (
      <Screen title={title}>
        <NotFound />
      </Screen>
    );
  }
  return (
    <RecordQuery seasonId={seasonId} title={title}>
      {children}
    </RecordQuery>
  );
}
