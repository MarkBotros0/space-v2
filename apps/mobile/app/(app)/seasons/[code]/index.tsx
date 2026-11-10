import { useState } from "react";
import { useRouter } from "expo-router";
import { Copy, Pencil } from "lucide-react-native";

import { DuplicateSeasonDialog } from "../../../../src/components/season/DuplicateSeasonDialog";
import { QueryGate, SeasonLinkNotFound } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { iconWithClassName } from "../../../../src/design/lib/icon";
import { phoneDayKey } from "../../../../src/design/seasons/season-timeline";
import { Button } from "../../../../src/design/ui";
import { useStaffOrgToday } from "../../../../src/hooks/use-dashboard";
import { useSeasonRoster } from "../../../../src/hooks/use-group-admin";
import { useSeasonAdmins } from "../../../../src/hooks/use-season-admins";
import { useSeasonPeople } from "../../../../src/hooks/use-season-people";
import { useSeasonRoute } from "../../../../src/hooks/use-season-route";
import { SeasonOverview } from "../../../../src/screens/season/season-overview";
import { seasonSuggestion } from "../../../../src/screens/season-people/source";
import { useSessionStore, useIsSuper } from "../../../../src/store/session";

iconWithClassName(Pencil, Copy);

/**
 * /seasons/[code] — any season, any role that may see it (spec 02 §9; G4).
 * One overview, no tabs (owner, 2026-11-07): the season at a glance, its
 * figures, the next step it waits for, who is in it as one People card
 * (admins, then groups with their leaders, then students), and what can be
 * done to it as tiles: Sessions, Assignments, Quizzes, End season, Results.
 * Adding people lives in the People card, not a tile (owner, 2026-11-07). Whoever the server says administers it (canAdminister, C4) reads the
 * roster and manages; a SUPER also reads the admins, and edits or duplicates
 * from the buttons beside the name. An ADMIN edits description and budgets
 * (REG-72) at the foot.
 */
export default function SeasonDetailScreen() {
  const router = useRouter();
  const { code, season: detail } = useSeasonRoute();
  const isSuper = useIsSuper();
  const isAdmin = useSessionStore((s) => s.user?.role === "ADMIN");
  const [duplicating, setDuplicating] = useState(false);
  const seasonId = detail.data?.id ?? null;
  // Nobody but a Super reads or changes admins.
  const admins = useSeasonAdmins(seasonId, { enabled: isSuper && seasonId !== null });
  // The students under each group; only whoever administers the season may read them.
  const roster = useSeasonRoster(detail.data?.canAdminister ? seasonId : null);
  // A draft's "N people passed <last season>" suggestion reads the picker's own list (cached for it).
  const suggestFor = detail.data?.canAdminister && detail.data.status === "DRAFT";
  const candidates = useSeasonPeople(seasonId, { enabled: !!suggestFor });
  // The org's day for the timeline; never waited on, and a failure leaves the device's.
  const orgToday = useStaffOrgToday(
    detail.data && (detail.data.canAdminister || isSuper) ? detail.data.id : null,
  ).today;

  const refresh = () => {
    if (code !== null) void detail.refetch();
    if (isSuper && seasonId !== null) void admins.refetch();
    if (detail.data?.canAdminister) void roster.refetch();
    if (suggestFor) void candidates.refetch();
  };

  const body =
    code === null ? (
      <SeasonLinkNotFound />
    ) : (
      <QueryGate query={detail}>
        {(s) => (
          <>
            <SeasonOverview
              season={s}
              today={orgToday ?? phoneDayKey()}
              isSuper={isSuper}
              isAdmin={isAdmin}
              admins={admins}
              roster={roster.data}
              suggested={suggestFor && candidates.data ? seasonSuggestion(candidates.data) : null}
              onDuplicate={() => setDuplicating(true)}
            />
            {isSuper ? (
              <DuplicateSeasonDialog
                season={s}
                open={duplicating}
                onClose={() => setDuplicating(false)}
                onDuplicated={(newCode) => router.push({ pathname: "/seasons/[code]", params: { code: newCode } })}
              />
            ) : null}
          </>
        )}
      </QueryGate>
    );

  return (
    <Screen
      title={detail.data?.title}
      subtitle={detail.data ? `Code: ${detail.data.code}` : undefined}
      // Owner 2026-11-07: Edit and Duplicate sit beside the name, not among the Manage cards.
      trailing={
        isSuper && detail.data ? (
          <>
            <Button
              variant="secondary"
              size="icon"
              accessibilityLabel="Edit season"
              onPress={() => router.push({ pathname: "/seasons/[code]/edit", params: { code: detail.data.code } })}
            >
              <Pencil size={18} className="text-foreground" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              accessibilityLabel="Duplicate season"
              onPress={() => setDuplicating(true)}
            >
              <Copy size={18} className="text-foreground" />
            </Button>
          </>
        ) : undefined
      }
      refreshing={detail.isRefetching}
      onRefresh={refresh}
    >
      {body}
    </Screen>
  );
}
