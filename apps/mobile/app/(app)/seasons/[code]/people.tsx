import type { ReactNode } from "react";
import { useLocalSearchParams } from "expo-router";

import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { EmptyState } from "../../../../src/design/ui";
import { useSeasonByCode } from "../../../../src/hooks/use-seasons";
import { PeopleList } from "../../../../src/screens/season-people/people-list";

/**
 * Add people to a season (people picker). The server's own `canAdminister`
 * gates it: this season's admins and a super admin. Entry point: the season screen.
 */
export default function SeasonPeopleScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === "string" && raw.length > 0 ? raw : null;
  const season = useSeasonByCode(code);

  if (code !== null && season.isSuccess && season.data.canAdminister) {
    return <PeopleList seasonId={season.data.id} seasonTitle={season.data.title} />;
  }

  let body: ReactNode;
  if (code === null) body = <EmptyState title="Not found" description="That season link isn't valid." />;
  else if (season.isError) body = <RouteError onRetry={() => void season.refetch()} />;
  else if (season.isPending) body = <RouteSkeleton />;
  else
    body = <EmptyState title="Not available" description="Only this season's admins can add people to it." />;
  return <Screen title="Add people">{body}</Screen>;
}
