import { useRouter } from "expo-router";
import { CalendarPlus } from "lucide-react-native";
import { View } from "react-native";
import type { OrganisationReport, SeasonListItem } from "@space/shared";

import { SeasonPulse, staffPulseFigures } from "../../design/home/season-pulse";
import { InlineError, RouteSkeleton } from "../../design/layout/route-states";
import {
  Button,
  EmptyState,
  GroupedList,
  ListRow,
  ListSectionHeader,
  StatusChip,
  statusChip,
} from "../../design/ui";
import { useSeasonStaffDashboard } from "../../hooks/use-dashboard";
import { formatSeasonDay, keepTogether } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";
import { countOf } from "../../lib/plural";

const byStart = (a: SeasonListItem, b: SeasonListItem) => a.startDate.localeCompare(b.startDate);

/** One running season at a glance: the same card a season admin sees on Home. */
function RunningSeason({ season }: { season: SeasonListItem }) {
  const router = useRouter();
  const dash = useSeasonStaffDashboard(season.id);
  if (dash.isPending) return <RouteSkeleton />;
  if (dash.isError) {
    return (
      <InlineError
        message={`Couldn't load ${season.title}.`}
        onRetry={() => void dash.refetch()}
      />
    );
  }
  const { progress, cohort } = dash.data;
  return (
    <SeasonPulse
      title={season.title}
      subtitle={season.isCommunityWide ? "Community-wide" : undefined}
      progressPct={progress.pct}
      sessionsHeld={progress.sessionsHeld}
      sessionsTotal={progress.sessionsTotal}
      figures={staffPulseFigures(cohort.meanAttendancePct, cohort.studentCount)}
      onPress={() => router.push({ pathname: "/seasons/[code]", params: { code: season.code } })}
    />
  );
}

/**
 * Super Home's Seasons section (owner, 2026-11-07: "just an overview of the
 * students and season"): one pulse per ACTIVE season, then the drafts under
 * Coming up. The work inside a season (review, attendance, at risk) lives on
 * its page, never here.
 */
export function SuperSeasons({
  seasons,
  org,
}: {
  seasons: SeasonListItem[];
  /** For each draft's enrolled count; undefined while unknown, and the count is left out. */
  org: OrganisationReport | undefined;
}) {
  const router = useRouter();
  const running = seasons.filter((s) => s.status === "ACTIVE").sort(byStart);
  const drafts = seasons.filter((s) => s.status === "DRAFT").sort(byStart);
  const enrolled = new Map(org?.seasons.map((s) => [s.seasonId, s.activeCount]) ?? []);

  if (running.length === 0 && drafts.length === 0) {
    return (
      <EmptyState
        icon={CalendarPlus}
        title="No season running"
        description="Start the next season when it's ready."
        action={
          <Button className="self-start" onPress={() => router.push("/seasons/new")}>
            New season
          </Button>
        }
      />
    );
  }

  return (
    <View className="gap-2">
      <ListSectionHeader className="pb-0">Seasons</ListSectionHeader>
      <View className="gap-4">
        {running.map((s) => (
          <RunningSeason key={s.id} season={s} />
        ))}
        {drafts.length > 0 ? (
          <GroupedList header="Coming up">
            {drafts.map((s) => {
              const count = enrolled.get(s.id);
              return (
                <ListRow
                  key={s.id}
                  title={s.title}
                  subtitle={joinMeta([
                    `Starts ${keepTogether(formatSeasonDay(s.startDate))}`,
                    count === undefined ? null : countOf(count, "student"),
                    s.isCommunityWide ? "Community-wide" : null,
                  ])}
                  subtitleLines={2}
                  trailing={<StatusChip {...statusChip("season", s.status)} />}
                  chevron
                  onPress={() => router.push({ pathname: "/seasons/[code]", params: { code: s.code } })}
                />
              );
            })}
          </GroupedList>
        ) : null}
      </View>
    </View>
  );
}
