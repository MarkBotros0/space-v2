import type { ReactNode } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import { RouteError, RouteSkeleton } from "../../../../../src/design/layout/route-states";
import { Screen } from "../../../../../src/design/layout/screen";
import { Button, EmptyState } from "../../../../../src/design/ui";
import { useSeasonByCode } from "../../../../../src/hooks/use-seasons";
import { RosterList } from "../../../../../src/screens/season-roster/roster-list";

/** v1 admin/season/[code]/roster — `roster/import.tsx` (Plan 17) hangs off the "Import assignments" button. */
export default function SeasonRosterScreen() {
  const router = useRouter();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === "string" && raw.length > 0 ? raw : null;
  const season = useSeasonByCode(code);

  if (code !== null && season.isSuccess && season.data.canAdminister) {
    return (
      <RosterList
        seasonId={season.data.id}
        seasonTitle={season.data.title}
        seasonIsDraft={season.data.status === "DRAFT"}
        // Spec 16 §9 / v1 roster/page.tsx:42: the server's own canAdminister,
        // not a client re-derivation.
        trailing={
          <Button
            variant="secondary"
            onPress={() => router.push({ pathname: "/seasons/[code]/roster/import", params: { code } })}
          >
            Import assignments
          </Button>
        }
        onNewGroup={() => router.push({ pathname: "/group/new", params: { seasonId: String(season.data.id) } })}
      />
    );
  }

  let body: ReactNode;
  if (code === null) body = <EmptyState title="Not found" description="That season link isn't valid." />;
  else if (season.isError) body = <RouteError onRetry={() => void season.refetch()} />;
  else if (season.isPending) body = <RouteSkeleton />;
  else body = <EmptyState title="Not available" description="Only this season's admins can manage its roster." />;
  return <Screen title="Students and groups">{body}</Screen>;
}
