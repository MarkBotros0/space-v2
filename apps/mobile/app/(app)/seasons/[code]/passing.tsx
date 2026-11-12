import type { ReactNode } from "react";

import { QueryGate, SeasonLinkNotFound } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { EmptyState } from "../../../../src/design/ui";
import { usePassingOutlook } from "../../../../src/hooks/use-season-passing";
import { useSeasonRoute } from "../../../../src/hooks/use-season-route";
import { apiErrorStatus } from "../../../../src/lib/api-error";
import { isAdminOfSeasonForUi } from "../../../../src/lib/season-admin";
import { OutlookScreen } from "../../../../src/screens/season-passing/outlook-screen";
import { useSessionStore } from "../../../../src/store/session";

/**
 * /seasons/[code]/passing: who is on track to pass the season and who is below the mark, and the
 * season's pass criteria (season passing). The season's admin and supers see every student and set
 * the criteria; a leader sees their own groups' students. Anyone else is told it isn't theirs.
 */
export default function SeasonPassingScreen() {
  const { code, season } = useSeasonRoute();
  const seasonId = season.data?.id ?? null;
  const outlook = usePassingOutlook(seasonId);
  const mayPost = useSessionStore((s) => seasonId !== null && isAdminOfSeasonForUi(s.user, s.scopes, seasonId));
  const canRemind = mayPost && season.data?.status === "ACTIVE";

  let body: ReactNode;
  if (code === null) body = <SeasonLinkNotFound />;
  else if (apiErrorStatus(outlook.error) === 403)
    body = (
      <EmptyState
        title="Not available"
        description="Only this season's admins, its leaders and super admins see who is on track."
      />
    );
  else
    body = (
      <QueryGate query={season}>
        {(s) => (
          <QueryGate query={outlook}>
            {(o) => <OutlookScreen seasonId={s.id} outlook={o} canRemind={canRemind} />}
          </QueryGate>
        )}
      </QueryGate>
    );

  return (
    <Screen
      title="Passing"
      subtitle={season.data?.title}
      refreshing={outlook.isRefetching}
      onRefresh={() => {
        if (seasonId !== null) void outlook.refetch();
      }}
    >
      {body}
    </Screen>
  );
}
