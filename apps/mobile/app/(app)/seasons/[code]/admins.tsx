import type { ReactNode } from "react";

import { SeasonAdmins } from "../../../../src/components/season/SeasonAdmins";
import { RouteError, RouteSkeleton, SeasonLinkNotFound } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { EmptyState } from "../../../../src/design/ui";
import { useSeasonRoute } from "../../../../src/hooks/use-season-route";
import { useIsSuper } from "../../../../src/store/session";

/**
 * A season's admins (owner, 2026-11-07: a card on the overview, first in
 * Manage, opens this): who administers it, Remove, and Add admin. Super only.
 * Its own screen, so Add admin's picker sheet never opens over another sheet.
 */
export default function SeasonAdminsScreen() {
  const { code, season } = useSeasonRoute();
  const isSuper = useIsSuper();

  let body: ReactNode;
  if (code === null) body = <SeasonLinkNotFound />;
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
