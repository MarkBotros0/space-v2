/**
 * A season's page as one overview (owner, 2026-11-07: no Overview / Groups /
 * Sessions tabs, and not a stack of rows). Top to bottom:
 * - the season at a glance: status, dates, where it is in its life, About;
 * - the next step the caller supplies (Start season on a draft, End season past
 *   its end date), when there is one;
 * - who is in it, as one People card: admins, groups, students (owner, 2026-11-07). No separate
 *   figures card: the People card and the tiles already give the counts (owner, 2026-11-13);
 * - what can be done to it, as a grid of tiles (Sessions, Assignments,
 *   Quizzes, ...), then the caller's extra cards.
 */
import type { SeasonDetail } from "@space/shared";
import type { ReactNode } from "react";
import { View } from "react-native";

import { formatSeasonDay } from "../../lib/format";
import { ListSectionHeader } from "../../design/ui/grouped-list";
import { StatusChip, statusChip } from "../../design/ui/status-chip";
import { Text } from "../../design/ui/text";
import { ActionGrid, type SeasonAction } from "./action-grid";
import { seasonTimeline } from "./season-timeline";

export type { SeasonAction } from "./action-grid";

const TIMELINE_TEXT = {
  info: "text-info",
  warn: "text-warn",
  neutral: "text-muted-foreground",
} as const;

function SeasonSummary({ season, today }: { season: SeasonDetail; today: string }) {
  const timeline = seasonTimeline(season, today);
  return (
    <View testID="season-summary" className="flex-col gap-2 rounded-group bg-surface p-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <StatusChip {...statusChip("season", season.status)} />
        {season.graduatesOnPass ? <StatusChip tone="ok" label="Graduating season" /> : null}
        {season.isCommunityWide ? <StatusChip tone="info" label="Community-wide" /> : null}
      </View>
      <Text variant="headline">{`${formatSeasonDay(season.startDate)} – ${formatSeasonDay(season.endDate)}`}</Text>
      <Text variant="subhead" className={`font-semibold ${TIMELINE_TEXT[timeline.tone]}`}>
        {timeline.label}
      </Text>
      {season.description ? (
        <Text variant="body" className="mt-1 text-foreground">
          {season.description}
        </Text>
      ) : null}
    </View>
  );
}

export function SeasonDetailView({
  season,
  today,
  actions,
  nextStep,
  attention,
  people,
  extra,
}: {
  season: SeasonDetail;
  /** The org's day key, or the phone's. */
  today: string;
  actions: SeasonAction[];
  nextStep?: ReactNode;
  /** A running season's work queues (review, attendance, at risk), under the next step. */
  attention?: ReactNode;
  /** Who is in it: admins, groups and students, as one card. */
  people: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <View className="flex-col gap-6">
      <SeasonSummary season={season} today={today} />
      {nextStep}
      {attention}
      <View className="flex-col gap-2">
        <ListSectionHeader className="pb-0">People</ListSectionHeader>
        {people}
      </View>
      {actions.length > 0 ? (
        <View className="flex-col gap-2">
          <ListSectionHeader className="pb-0">Manage</ListSectionHeader>
          <ActionGrid actions={actions} />
        </View>
      ) : null}
      {extra}
    </View>
  );
}
