import type { ReactNode } from "react";
import { useLocalSearchParams } from "expo-router";

import { SeasonAdmins } from "../../../../src/components/season/SeasonAdmins";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { EmptyState } from "../../../../src/design/ui";
import { useSeasonByCode } from "../../../../src/hooks/use-seasons";
import { useIsSuper } from "../../../../src/store/session";

/**
 * A season's admins (owner, 2026-11-07: a card on the overview, first in
 * Manage, opens this): who administers it, Remove, and Add admin. Super only.
 * Its own screen, so Add admin's picker sheet never opens over another sheet.
 */
export default function SeasonAdminsScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === "string" && raw.length > 0 ? raw : null;
  const isSuper = useIsSuper();
  const season = useSeasonByCode(code);

  let body: ReactNode;
  if (code === null) body = <EmptyState title="Not found" description="That season link isn't valid." />;
  else if (!isSuper)
    body = <EmptyState title="Not available" description="Only a super admin can change a season's admins." />;
  else if (season.isError) body = <RouteError onRetry={() => void season.refetch()} />;
  else if (season.isPending) body = <RouteSkeleton />;
  else body = <SeasonAdmins seasonId={season.data.id} seasonTitle={season.data.title} />;

  return (
    <Screen title="Admins" subtitle={season.data?.title}>
      {body}
    </Screen>
  );
}
