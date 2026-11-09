import { isSeasonFinished } from "@space/shared";
import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { SeasonsList } from "../../../../src/design/seasons/seasons-list";
import { Button, EmptyState, SegmentedControl } from "../../../../src/design/ui";
import { useSeasons } from "../../../../src/hooks/use-seasons";
import { useRole } from "../../../../src/store/session";

/**
 * SUPER's seasons list (v1 /super/seasons, B5-2): title, "New season" and the
 * program-grouped list (editing is on the season detail). ADMIN and MENTOR may reach this
 * route and see the same list read-only. The status filter works over the role-scoped list
 * already loaded. The list groups by program, so program chips would only repeat it (owner, 2026-11-07).
 */
const STAFF_ROLES = new Set(["SUPER", "ADMIN", "MENTOR"]);

type StatusFilter = "all" | "active" | "draft" | "finished";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "finished", label: "Finished" },
];

const NONE_WITH_STATUS: Record<Exclude<StatusFilter, "all">, string> = {
  active: "No active seasons",
  draft: "No draft seasons",
  finished: "No finished seasons",
};

function matchesStatus(status: string, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "finished") return isSeasonFinished(status);
  return status === filter.toUpperCase();
}

export default function SeasonsScreen() {
  const router = useRouter();
  const role = useRole();
  const isStaff = role !== null && STAFF_ROLES.has(role);
  const isSuper = role === "SUPER";
  const seasons = useSeasons(isStaff);
  const [status, setStatus] = useState<StatusFilter>("all");

  if (!isStaff) {
    return (
      <Screen title="Seasons">
        <EmptyState title="Not available" description="The seasons list isn't available for your role." />
      </Screen>
    );
  }

  const newSeason = () => router.push("/seasons/new");
  const visible = seasons.data ? seasons.data.filter((s) => matchesStatus(s.status, status)) : [];
  const hasSeasons = (seasons.data?.length ?? 0) > 0;

  return (
    <Screen
      title="Seasons"
      trailing={
        isSuper ? (
          <Button size="sm" onPress={newSeason}>
            New season
          </Button>
        ) : undefined
      }
      refreshing={seasons.isRefetching}
      onRefresh={() => void seasons.refetch()}
    >
      <View className="flex-col gap-4">
        {seasons.isPending ? (
          <RouteSkeleton />
        ) : seasons.isError ? (
          <RouteError onRetry={() => void seasons.refetch()} />
        ) : (
          <>
            {hasSeasons ? (
              <SegmentedControl
                options={STATUS_OPTIONS}
                value={status}
                onChange={(next) => setStatus(next as StatusFilter)}
              />
            ) : null}
            {status !== "all" && visible.length === 0 ? (
              <EmptyState title={NONE_WITH_STATUS[status]} />
            ) : (
              <SeasonsList
                rows={visible}
                onOpen={(row) => router.push({ pathname: "/seasons/[code]", params: { code: row.code } })}
                emptyDescription={isSuper ? undefined : "No seasons to show."}
                emptyAction={isSuper ? <Button onPress={newSeason}>New season</Button> : undefined}
              />
            )}
          </>
        )}
      </View>
    </Screen>
  );
}
