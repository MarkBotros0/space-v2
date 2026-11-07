import { useRouter } from "expo-router";
import type { UseQueryResult } from "@tanstack/react-query";
import { View } from "react-native";
import type { SeasonHistoryRow } from "@space/shared";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { InlineError, RouteSkeleton } from "../../design/layout/route-states";
import { EmptyState, GroupedList, ListRow, Text } from "../../design/ui";
import { betweenSeasonsState } from "../../lib/between-seasons";
import { FinishedSeasonCard } from "./finished-season-card";

const NEXT_SEASON = "You'll see your next season here when you're added.";

/**
 * Today for a student with no current season. Reads the newest past enrolment: a finished
 * season gets its card, a dropped one only a quiet note (no reason shown), and no history
 * at all is a first-timer. A history that hasn't loaded shows a skeleton or an error,
 * never the first-time message.
 */
export function BetweenSeasons({ history }: { history: UseQueryResult<SeasonHistoryRow[]> }) {
  const router = useRouter();
  if (history.isPending) return <RouteSkeleton />;
  if (history.data === undefined) {
    return (
      <InlineError message="Couldn't load your seasons." onRetry={() => void history.refetch()} />
    );
  }
  const state = betweenSeasonsState(history.data);

  return (
    <View className="flex-col gap-4">
      {state.kind === "finished" ? <FinishedSeasonCard row={state.row} /> : null}
      {state.kind === "first" ? (
        <>
          <EmptyState
            icon={NAV_ICONS.season}
            title="Welcome to JPC Space"
            description="You'll see your first season here when you're added."
          />
          <GroupedList header="While you wait">
            <ListRow
              title="Complete your profile"
              chevron
              onPress={() => router.push("/profile")}
            />
          </GroupedList>
        </>
      ) : state.kind === "dropped" ? (
        <EmptyState
          icon={NAV_ICONS.season}
          title="You're not in a season right now"
          description={NEXT_SEASON}
        />
      ) : (
        <Text variant="subhead" className="text-center text-muted-foreground">
          {NEXT_SEASON}
        </Text>
      )}
    </View>
  );
}
