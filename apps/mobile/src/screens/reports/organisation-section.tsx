import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";

import { RankedBars } from "../../components/charts/RankedBars";
import { NAV_ICONS } from "../../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  GroupedList,
  ListRow,
  StatTile,
  StatusChip,
  Text,
  statusChip,
} from "../../design/ui";
import { useOrganisationReport } from "../../hooks/use-reports";
import { joinMeta } from "../../lib/join-meta";

/** A tile that opens its list: the wrapper takes the tile's flex so tiles still wrap in pairs. */
function TilePress({ onPress, children }: { onPress: () => void; children: ReactNode }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="min-w-[136px] flex-1">
      {children}
    </Pressable>
  );
}

/**
 * v1 super/reports/page.tsx (B5-4): three StatCards, "Active members per
 * season" and "Alumni by graduation year" cards, then the "Students per
 * season" table. V2 decisions kept: the first card says "Student accounts"
 * (R51, spec D4 — v1's "Current students" counted accounts never enrolled in
 * anything), and the pies are ranked lists (R60, R93, R97: a pie coloured by
 * palette index implies a severity ranking that does not exist, and labelled
 * slices do not fit 375px).
 */
export function OrganisationSection() {
  const router = useRouter();
  const { data, isPending, isError, refetch } = useOrganisationReport(true);

  if (isPending) return <RouteSkeleton />;
  if (isError) return <RouteError onRetry={() => void refetch()} />;

  const active = data.seasons.filter((s) => s.activeCount > 0);
  const maxActive = active.reduce((n, x) => Math.max(n, x.activeCount), 0);

  return (
    <View className="flex-col gap-4">
      <View testID="organisation-tiles" className="flex-row flex-wrap gap-3">
        <TilePress onPress={() => router.push("/students")}>
          <StatTile className="flex-none" label="Student accounts" value={data.totalStudentsNotGraduated} />
        </TilePress>
        <TilePress onPress={() => router.push("/students/alumni")}>
          <StatTile className="flex-none" label="Alumni" value={data.totalAlumni} />
        </TilePress>
        <TilePress onPress={() => router.push("/seasons")}>
          <StatTile className="flex-none" label="Active seasons" value={data.activeSeasonCount} />
        </TilePress>
      </View>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active members per season</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {active.length === 0 ? (
            <EmptyState
              icon={NAV_ICONS.students}
              title="No active members"
              description="Enroll students in a season to see the breakdown."
            />
          ) : (
            <RankedBars
              bars={[...active]
                .sort((a, b) => b.activeCount - a.activeCount)
                .map((s) => ({
                  key: String(s.seasonId),
                  label: s.title,
                  value: Math.round((s.activeCount / maxActive) * 100),
                  caption: `${s.activeCount} active`,
                }))}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alumni by graduation year</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {data.alumniByYear.length === 0 ? (
            <EmptyState
              icon={NAV_ICONS.alumni}
              title="No alumni yet"
              description="Graduated students will be counted here by class year."
            />
          ) : (
            <View className="flex-col gap-1">
              {data.alumniByYear.map((a) => (
                <Text key={a.year} className="text-sm">{`${a.year}: ${a.count}`}</Text>
              ))}
            </View>
          )}
        </CardContent>
      </Card>

      <View className="flex-col gap-2">
        <Text variant="headline" accessibilityRole="header">
          Students per season
        </Text>
        <Text variant="subhead" className="text-muted-foreground">
          Active, completed, and dropped counts
        </Text>
        {data.seasons.length === 0 ? (
          <EmptyState
            icon={NAV_ICONS.season}
            title="No seasons yet"
            description="Create a season to see enrollment breakdowns."
          />
        ) : (
          <GroupedList>
            {data.seasons.map((r) => (
              <ListRow
                key={r.seasonId}
                title={r.title}
                subtitle={joinMeta([
                  `${r.leaderCount} leaders`,
                  `${r.activeCount} active`,
                  `${r.completedCount} completed`,
                  `${r.withdrawnCount} dropped`,
                ])}
                subtitleLines={3}
                trailing={<StatusChip {...statusChip("season", r.status)} />}
                chevron
                onPress={() =>
                  router.push({ pathname: "/seasons/[code]", params: { code: r.code } })
                }
              />
            ))}
          </GroupedList>
        )}
      </View>
    </View>
  );
}
