import { CalendarRange } from "lucide-react-native";
import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { PageTitle } from "../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import { SeasonsList } from "../../src/design/seasons/seasons-list";
import { useCurrentSeasonId, useSeasonDetail, useSeasons } from "../../src/hooks/use-seasons";
import { EditSeason } from "../../src/components/season/EditSeason";
import { StudentSeason } from "../../src/components/season/StudentSeason";
import { formatDate } from "../../src/lib/format";
import { Button, Card, EmptyState, Text } from "../../src/design/ui";
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
        <Card className="p-4">
          <Text className="text-2xl font-bold">{s.title}</Text>
          <Text className="text-sm font-medium text-muted-foreground">{`${s.code} · ${s.status}`}</Text>
          <Text className="text-sm font-medium text-muted-foreground">
            {`${formatDate(s.startDate)} – ${formatDate(s.endDate)}`}
          </Text>
          {s.description ? <Text>{s.description}</Text> : null}
          <Text className="text-sm font-medium">{`${s.sessionCount} sessions · ${s.studentCount} students`}</Text>
        </Card>
        <Card className="p-4">
          <Text className="text-lg font-semibold">Groups</Text>
          {s.groups.length === 0 ? (
            <Text className="text-muted-foreground">No groups yet.</Text>
          ) : (
            s.groups.map((g) => (
              <View key={g.id} className="mt-2">
                <Text>{g.name}</Text>
                <Text className="text-xs text-muted-foreground">
                  {g.leaderNames.length > 0
                    ? `${g.studentCount} students · ${g.leaderNames.join(", ")}`
                    : `${g.studentCount} students`}
                </Text>
              </View>
            ))
          )}
        </Card>
        <View className="flex-row flex-wrap gap-2">
          <Button variant="secondary" size="lg" onPress={() => router.push("/calendar")}>
            Calendar
          </Button>
          <Button variant="secondary" size="lg" onPress={() => router.push("/assignments")}>
            Assignments
          </Button>
        </View>
        {canEdit ? <EditSeason season={s} /> : null}
      </View>
    );
  }

  return (
    <ShellFrame onRefresh={handleRefresh} refreshing={detail.isRefetching}>
      {body}
    </ShellFrame>
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
      <PageTitle
        title="My Season"
        subtitle="You aren't assigned to a season yet. Contact a super-admin to be added."
      />
    );
  else
    body = (
      <View className="flex-col gap-4">
        <PageTitle title="My Season" subtitle="Seasons you administer." />
        <SeasonsList
          rows={seasons.data}
          onOpen={(row) => router.push({ pathname: "/seasons/[code]", params: { code: row.code } })}
        />
      </View>
    );

  return (
    <ShellFrame refreshing={seasons.isRefetching} onRefresh={() => void seasons.refetch()}>
      {body}
    </ShellFrame>
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
