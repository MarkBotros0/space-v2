import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CalendarDays, GraduationCap, MailPlus, Users } from "lucide-react-native";
import { View } from "react-native";
import { UPCOMING_EVENTS_LIMIT } from "@space/shared";

import { UpcomingEventsCard } from "../home/upcoming-events-card";
import { FigureGrid, type FigureTileProps } from "../home/figure-tile";
import { InlineError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { ListSectionHeader } from "../../design/ui";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useOrganisationReport } from "../../hooks/use-reports";
import { useSeasons } from "../../hooks/use-seasons";
import { usePendingInviteCount } from "../../hooks/use-users";
import { firstName } from "../../lib/format";
import { queryKeys } from "../../lib/query-keys";
import { useSessionStore } from "../../store/session";
import { OverdueCallout } from "../season-end/overdue-callout";
import { AnnouncementsHomeCard } from "../announcements/announcements-home-card";
import { SuperSeasons } from "./super-seasons";

/**
 * Super Home: an overview of the community and its seasons, never a work
 * queue (owner, 2026-11-07: "the super user should see just an overview of the
 * students and season"). Students at risk, submissions to review, sessions
 * without attendance and the live session belong to a season's admin; Super
 * reaches them from the season's page. What stays: the overdue-season prompt,
 * each running season's pulse and the drafts coming up, the community figures,
 * and events. Spec: docs/superpowers/specs/2026-11-07-super-home-overview-design.md.
 */
export function SuperToday() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const name = useSessionStore((s) => s.user?.name ?? null);
  const seasons = useSeasons();
  const org = useOrganisationReport(true);
  const invites = usePendingInviteCount(true);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);

  const refresh = () => {
    void seasons.refetch();
    void org.refetch();
    void invites.refetch();
    void events.refetch();
    // Every running season's pulse reads its own dashboard query.
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  };

  const tiles: FigureTileProps[] = [];
  if (org.data) {
    tiles.push(
      {
        label: "Students",
        value: String(org.data.totalStudentsNotGraduated),
        icon: Users,
        onPress: () => router.push("/students"),
      },
      {
        label: "Alumni",
        value: String(org.data.totalAlumni),
        icon: GraduationCap,
        onPress: () => router.push({ pathname: "/students", params: { show: "alumni" } }),
      },
    );
  }
  // Inviting people is Super's own community job, so it stays (as a figure, not a task tile).
  if (invites.data !== undefined) {
    tiles.push({
      label: "Not invited yet",
      value: String(invites.data),
      icon: MailPlus,
      onPress: () => router.push({ pathname: "/community", params: { status: "pending" } }),
    });
  }
  tiles.push({
    label: "Upcoming events",
    value: events.data ? String(events.data.total) : "—",
    icon: CalendarDays,
    onPress: () => router.push("/events"),
  });

  const named = (name ?? "").trim() !== "";
  return (
    <Screen
      title={named ? `Hi, ${firstName(name)}` : "Home"}
      compactTitle="Home"
      home
      refreshing={seasons.isRefetching || org.isRefetching || events.isRefetching}
      onRefresh={refresh}
    >
      <View className="flex-col gap-4">
        {/* Owner 2026-11-08: the community figures first; 2026-11-09: then an
            overdue season's End prompt, then the seasons as rows, announcements
            and events. */}
        <View className="gap-2">
          <ListSectionHeader className="pb-0">Community</ListSectionHeader>
          {org.isPending ? (
            <RouteSkeleton />
          ) : (
            <>
              {org.isError ? (
                <InlineError message="Couldn't load the community figures." onRetry={() => void org.refetch()} />
              ) : null}
              <FigureGrid tiles={tiles} />
            </>
          )}
        </View>
        <OverdueCallout />
        {seasons.isPending ? (
          <RouteSkeleton />
        ) : seasons.isError ? (
          <InlineError message="Couldn't load the seasons." onRetry={() => void seasons.refetch()} />
        ) : (
          <SuperSeasons seasons={seasons.data} org={org.data} />
        )}
        <AnnouncementsHomeCard />
        <UpcomingEventsCard query={events} />
      </View>
    </Screen>
  );
}
