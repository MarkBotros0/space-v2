import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import type { OrganisationReport } from "@space/shared";

import { RankedBars } from "../../components/charts/RankedBars";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { SeasonStatusBadge } from "../../design/seasons/season-status-badge";
import { StatCard } from "../../design/students/stat-card";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  Text,
  type DataTableColumn,
} from "../../design/ui";
import { useOrganisationReport } from "../../hooks/use-reports";
import { NAV_ICONS } from "../../design/icons/nav-icon";

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

  const columns: DataTableColumn<OrganisationReport["seasons"][number]>[] = [
    {
      key: "season",
      header: "Season",
      cell: (r) => (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ${r.title}`}
          onPress={() => router.push({ pathname: "/seasons/[code]", params: { code: r.code } })}
        >
          <Text className="font-medium text-foreground">{r.title}</Text>
        </Pressable>
      ),
    },
    { key: "status", header: "Status", cell: (r) => <SeasonStatusBadge status={r.status} /> },
    { key: "leaders", header: "Leaders", cell: (r) => `${r.leaderCount} leaders` },
    { key: "active", header: "Active", cell: (r) => `${r.activeCount} active` },
    { key: "completed", header: "Completed", cell: (r) => `${r.completedCount} completed` },
    {
      key: "dropped",
      header: "Dropped",
      cell: (r) =>
        r.withdrawnCount > 0 ? (
          <Text className="text-xs font-medium text-error-600 dark:text-error-400">
            {`${r.withdrawnCount} dropped`}
          </Text>
        ) : (
          `${r.withdrawnCount} dropped`
        ),
    },
  ];

  return (
    <View className="flex-col gap-4">
      <View className="flex-row gap-3">
        <StatCard
          label="Student accounts"
          value={String(data.totalStudentsNotGraduated)}
          onPress={() => router.push("/students")}
        />
        <StatCard
          label="Alumni"
          value={String(data.totalAlumni)}
          variant="teal"
          onPress={() => router.push("/students/alumni")}
        />
        <StatCard
          label="Active seasons"
          value={String(data.activeSeasonCount)}
          onPress={() => router.push("/seasons")}
        />
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Students per season</CardTitle>
          <Text className="text-sm text-muted-foreground">
            Active, completed, and dropped counts
          </Text>
        </CardHeader>
        <CardContent className="pt-0">
          {data.seasons.length === 0 ? (
            <EmptyState
              icon={NAV_ICONS.season}
              title="No seasons yet"
              description="Create a season to see enrollment breakdowns."
            />
          ) : (
            <DataTable columns={columns} rows={data.seasons} rowKey={(r) => r.seasonId} />
          )}
        </CardContent>
      </Card>
    </View>
  );
}
