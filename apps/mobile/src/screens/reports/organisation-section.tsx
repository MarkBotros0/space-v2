import type { ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { EmptyState, GroupedList, Text, statusChip } from "../../design/ui";
import { useOrganisationReport } from "../../hooks/use-reports";
import { CountBars, FigureCard, SeasonCountsRow } from "./organisation-parts";

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View className="flex-col gap-2">
      <View className="flex-col gap-0.5 px-1">
        <Text variant="headline" accessibilityRole="header">
          {title}
        </Text>
        {hint ? (
          <Text variant="subhead" className="text-muted-foreground">
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/**
 * Reports' Organisation view, for a super (owner 2026-11-14 redesign of v1 super/reports, B5-4):
 * the community's three figures in one card, each opening its list ("Student accounts", R51 / D4:
 * v1's "Current students" counted accounts never enrolled); active members per season and alumni
 * by school year as counts over bars (R60, R93, R97: no pies); then every season with its counts
 * as figures, opening the season.
 */
export function OrganisationSection() {
  const router = useRouter();
  const { data, isPending, isError, refetch } = useOrganisationReport(true);

  if (isPending) return <RouteSkeleton />;
  if (isError) return <RouteError onRetry={() => void refetch()} />;

  const active = data.seasons.filter((s) => s.activeCount > 0).sort((a, b) => b.activeCount - a.activeCount);

  return (
    <View className="flex-col gap-6">
      <FigureCard
        figures={[
          {
            key: "students",
            label: "Student accounts",
            value: data.totalStudentsNotGraduated,
            icon: NAV_ICONS.students,
            onPress: () => router.push("/students"),
          },
          {
            key: "alumni",
            label: "Alumni",
            value: data.totalAlumni,
            icon: NAV_ICONS.alumni,
            onPress: () => router.push({ pathname: "/students", params: { show: "alumni" } }),
          },
          {
            key: "seasons",
            label: data.activeSeasonCount === 1 ? "Active season" : "Active seasons",
            value: data.activeSeasonCount,
            icon: NAV_ICONS.season,
            onPress: () => router.push("/seasons"),
          },
        ]}
      />

      <Section title="Active members per season" hint="Students studying in each running season">
        {active.length === 0 ? (
          <EmptyState
            icon={NAV_ICONS.students}
            title="No active members"
            description="Enroll students in a season to see the breakdown."
          />
        ) : (
          <CountBars
            bars={active.map((s) => ({
              key: String(s.seasonId),
              label: s.title,
              count: s.activeCount,
              unit: "active",
            }))}
          />
        )}
      </Section>

      <Section title="Alumni by school year">
        {data.alumniByYear.length === 0 ? (
          <EmptyState
            icon={NAV_ICONS.alumni}
            title="No alumni yet"
            description="Graduated students will be counted here by class year."
          />
        ) : (
          <CountBars
            bars={data.alumniByYear.map((a) => ({ key: String(a.year), label: String(a.year), count: a.count }))}
          />
        )}
      </Section>

      <Section title="Students per season" hint="Active, completed and dropped in each season">
        {data.seasons.length === 0 ? (
          <EmptyState
            icon={NAV_ICONS.season}
            title="No seasons yet"
            description="Create a season to see enrollment breakdowns."
          />
        ) : (
          <GroupedList>
            {data.seasons.map((r) => (
              <SeasonCountsRow
                key={r.seasonId}
                title={r.title}
                chip={statusChip("season", r.status)}
                counts={[
                  { label: r.leaderCount === 1 ? "Leader" : "Leaders", value: r.leaderCount },
                  { label: "Active", value: r.activeCount },
                  { label: "Completed", value: r.completedCount },
                  { label: "Dropped", value: r.withdrawnCount },
                ]}
                onPress={() => router.push({ pathname: "/seasons/[code]", params: { code: r.code } })}
              />
            ))}
          </GroupedList>
        )}
      </Section>
    </View>
  );
}
