import { CalendarRange } from "lucide-react-native";
import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { Screen } from "../../src/design/layout/screen";
import { SeasonsList } from "../../src/design/seasons/seasons-list";
import { useCurrentSeasonId, useSeasonDetail, useSeasons } from "../../src/hooks/use-seasons";
import { EditSeason } from "../../src/components/season/EditSeason";
import { StudentSeason } from "../../src/components/season/StudentSeason";
import { formatDate } from "../../src/lib/format";
import { joinMeta } from "../../src/lib/join-meta";
import { EmptyState, GroupedList, ListRow, StatusChip, statusChip, Text } from "../../src/design/ui";
import { useSessionStore } from "../../src/store/session";

/**
 * The season workspace (v1 /admin/season, /student/season). ADMIN is
 * `AdminSeason` (batch 4); the student branch is `StudentSeason` (Plan 11);
 * the remaining staff roles keep the current-season card until their batch.
 */
function StaffSeason() {
  const router = useRouter();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const current = useCurrentSeasonId();
  const detail = useSeasonDetail(current.seasonId);
  const canEdit = role === "SUPER";

  const handleRefresh = () => {
    if (current.seasonId !== null) void detail.refetch();
    else current.refetch();
  };

  let body: ReactNode;
  if (current.isPending) body = <RouteSkeleton />;
  else if (current.isError) body = <RouteError onRetry={current.refetch} />;
  else if (current.seasonId === null)
    body = <EmptyState icon={CalendarRange} title="No season" description="You aren't in a season right now." />;
  else if (detail.isPending) body = <RouteSkeleton />;
  else if (detail.isError) body = <RouteError onRetry={() => void detail.refetch()} />;
  else {
    const s = detail.data;
    body = (
      <View className="flex-col gap-4">
        <GroupedList>
          <ListRow
            title={s.title}
            subtitle={joinMeta([
              s.code,
              `${formatDate(s.startDate)} – ${formatDate(s.endDate)}`,
              `${s.sessionCount} sessions`,
              `${s.studentCount} students`,
            ])}
            trailing={<StatusChip {...statusChip("season", s.status)} />}
          />
        </GroupedList>
        {s.description ? (
          <Text variant="body" className="px-4 text-foreground">
            {s.description}
          </Text>
        ) : null}
        <GroupedList header="Groups">
          {s.groups.length === 0 ? (
            <ListRow title="No groups yet." />
          ) : (
            s.groups.map((g) => (
              <ListRow
                key={g.id}
                title={g.name}
                subtitle={joinMeta([`${g.studentCount} students`, g.leaderNames.join(", ")])}
              />
            ))
          )}
        </GroupedList>
        <GroupedList>
          <ListRow title="Calendar" chevron onPress={() => router.push("/calendar")} />
          <ListRow title="Assignments" chevron onPress={() => router.push("/assignments")} />
        </GroupedList>
        {canEdit ? <EditSeason season={s} /> : null}
      </View>
    );
  }

  return (
    <Screen title="My Season" onRefresh={handleRefresh} refreshing={detail.isRefetching}>
      {body}
    </Screen>
  );
}

/**
 * v1 app/admin/season/page.tsx: an ADMIN with no season is told to contact a
 * super-admin; with exactly one, goes straight into it (REG-72); with
 * several, sees "Seasons you administer." as a list grouped by program.
 */
function AdminSeason() {
  const router = useRouter();
  const seasons = useSeasons(true);
  const only = seasons.data?.length === 1 ? seasons.data[0]! : null;

  useEffect(() => {
    if (only) router.replace({ pathname: "/seasons/[code]", params: { code: only.code } });
  }, [only, router]);

  let body: ReactNode;
  if (seasons.isPending || only) body = <RouteSkeleton />;
  else if (seasons.isError) body = <RouteError onRetry={() => void seasons.refetch()} />;
  else if (seasons.data.length === 0)
    body = (
      <EmptyState
        icon={CalendarRange}
        title="No season"
        description="You aren't assigned to a season yet. Contact a super-admin to be added."
      />
    );
  else
    body = (
      <SeasonsList
        rows={seasons.data}
        onOpen={(row) => router.push({ pathname: "/seasons/[code]", params: { code: row.code } })}
      />
    );

  return (
    <Screen
      title="My Season"
      refreshing={seasons.isRefetching}
      onRefresh={() => void seasons.refetch()}
    >
      {body}
    </Screen>
  );
}

export default function SeasonScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  // Two components rather than one with branches: the student half reads
  // GET /me/season and the staff half reads useCurrentSeasonId +
  // GET /seasons/:id — different hooks, so dispatch before any are called.
  if (role === "STUDENT") return <StudentSeason />;
  return role === "ADMIN" ? <AdminSeason /> : <StaffSeason />;
}
