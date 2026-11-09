import { isSeasonLive } from "@space/shared";
import type { ReactNode } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { EmptyState } from "../../../../src/design/ui";
import { useSeasonByCode } from "../../../../src/hooks/use-seasons";
import { parsePositiveInt } from "../../../../src/lib/params";
import { PeopleList } from "../../../../src/screens/season-people/people-list";

/**
 * Select from community: add people who already have an account (owner,
 * 2026-11-07). The server's own `canAdminister` gates it: this season's admins
 * and a super admin. Entry points: the season page's People card and its
 * suggestion (`?from=<season id>` opens with that season's passers ticked).
 * Invite new, for someone with no account yet, swaps this screen for its form.
 */
export default function SeasonPeopleScreen() {
  const router = useRouter();
  const { code: raw, from: rawFrom } = useLocalSearchParams<{ code: string; from?: string }>();
  const code = typeof raw === "string" && raw.length > 0 ? raw : null;
  const season = useSeasonByCode(code);

  if (code !== null && season.isSuccess && season.data.canAdminister) {
    const { code: seasonCode, status } = season.data;
    return (
      <PeopleList
        seasonId={season.data.id}
        seasonTitle={season.data.title}
        isDraft={status === "DRAFT"}
        from={parsePositiveInt(rawFrom)}
        onInviteNew={
          isSeasonLive(status)
            ? () => router.replace({ pathname: "/seasons/[code]/invite", params: { code: seasonCode } })
            : undefined
        }
      />
    );
  }

  let body: ReactNode;
  if (code === null) body = <EmptyState title="Not found" description="That season link isn't valid." />;
  else if (season.isError) body = <RouteError onRetry={() => void season.refetch()} />;
  else if (season.isPending) body = <RouteSkeleton />;
  else body = <EmptyState title="Not available" description="Only this season's admins can add people to it." />;
  return <Screen title="Select from community">{body}</Screen>;
}
