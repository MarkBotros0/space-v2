import { useRouter } from "expo-router";
import { CalendarPlus } from "lucide-react-native";
import { View } from "react-native";
import type { OrganisationReport, SeasonListItem } from "@space/shared";

import {
  Button,
  EmptyState,
  GroupedList,
  ListRow,
  ProgressRing,
  Skeleton,
  StatusChip,
  statusChip,
} from "../../design/ui";
import { useSeasonStaffDashboard } from "../../hooks/use-dashboard";
import { formatSeasonDay, keepTogether } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";
import { countOf } from "../../lib/plural";

const byStart = (a: SeasonListItem, b: SeasonListItem) => a.startDate.localeCompare(b.startDate);

/**
 * One running season as a row (owner, 2026-11-09: a full ring card per season
 * pushed everything else screens down): a small ring for how far through it is,
 * then sessions held, attendance and students in words. Its figures read the
 * season's own dashboard query; while that loads or fails the row still opens
 * the season, and a failure says so in the row with a retry.
 */
function RunningSeason({ season }: { season: SeasonListItem }) {
  const router = useRouter();
  const dash = useSeasonStaffDashboard(season.id);
  const open = () => router.push({ pathname: "/seasons/[code]", params: { code: season.code } });
  const pct = dash.data?.progress.pct ?? 0;
  let subtitle: string;
  if (dash.isPending) subtitle = "Loading…";
  else if (dash.isError) subtitle = "Couldn't load its figures. Tap to retry.";
  else {
    const { progress, cohort } = dash.data;
    subtitle = joinMeta([
      progress.sessionsTotal === 0
        ? "No sessions yet"
        : `${progress.sessionsHeld} of ${progress.sessionsTotal} sessions held`,
      cohort.meanAttendancePct === null ? null : `${cohort.meanAttendancePct}% attendance`,
      countOf(cohort.studentCount, "student"),
      season.isCommunityWide ? "Community-wide" : null,
    ]);
  }
  return (
    <ListRow
      title={season.title}
      subtitle={subtitle}
      subtitleLines={2}
      leading={
        dash.isPending ? (
          <Skeleton className="size-11 rounded-full" />
        ) : (
          <ProgressRing value={pct} size={44} strokeWidth={5} label={`${season.title} progress ${pct}%`} />
        )
      }
      chevron
      onPress={dash.isError ? () => void dash.refetch() : open}
    />
  );
}

/**
 * Super Home's Seasons section (owner, 2026-11-07: "just an overview of the
 * students and season"): one row per ACTIVE season, then the drafts under
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
    <View className="gap-4">
      {running.length > 0 ? (
        <GroupedList header="Active seasons">
          {running.map((s) => (
            <RunningSeason key={s.id} season={s} />
          ))}
        </GroupedList>
      ) : null}
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
  );
}
