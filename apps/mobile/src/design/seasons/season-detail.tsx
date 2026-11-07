/**
 * A season's page as one overview (owner, 2026-11-07: no Overview / Groups /
 * Sessions tabs, and not a stack of rows). Top to bottom:
 * - the season at a glance: status, dates, where it is in its life, About;
 * - its figures in one card: students, groups, sessions;
 * - the next step the caller supplies (Start season on a draft, End season past
 *   its end date), when there is one;
 * - what can be done to it, as a grid of tiles;
 * - its groups, each opening the group;
 * - its sessions, on demand (the list is long), then the caller's extra cards.
 */
import type { SeasonDetail } from "@space/shared";
import { Fragment, useState, type ReactNode } from "react";
import { View } from "react-native";

import { formatSeasonDay } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";
import { countOf } from "../../lib/plural";
import { GroupedList, ListRow, ListSectionHeader } from "../ui/grouped-list";
import { PillButton } from "../ui/pill-button";
import { StatusChip, statusChip } from "../ui/status-chip";
import { Text } from "../ui/text";
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
      <Text variant="headline">
        {`${formatSeasonDay(season.startDate)} – ${formatSeasonDay(season.endDate)}`}
      </Text>
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

function Figures({ season }: { season: SeasonDetail }) {
  const figures = [
    { label: season.studentCount === 1 ? "Student" : "Students", value: season.studentCount },
    { label: season.groups.length === 1 ? "Group" : "Groups", value: season.groups.length },
    { label: season.sessionCount === 1 ? "Session" : "Sessions", value: season.sessionCount },
  ];
  return (
    <View testID="season-figures" className="flex-row items-stretch rounded-group bg-surface py-4">
      {figures.map((f, i) => (
        <Fragment key={f.label}>
          {i > 0 ? <View className="w-px self-stretch bg-separator" /> : null}
          <View
            accessible
            accessibilityLabel={`${f.value} ${f.label.toLowerCase()}`}
            className="min-w-0 flex-1 items-center gap-0.5 px-1"
          >
            <Text variant="title" tabular numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {String(f.value)}
            </Text>
            <Text
              variant="caption"
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              className="text-muted-foreground"
            >
              {f.label}
            </Text>
          </View>
        </Fragment>
      ))}
    </View>
  );
}

function Sessions({ count, children }: { count: number; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  if (count === 0) return null;
  return (
    <View className="flex-col gap-2">
      <View className="flex-row items-center justify-between gap-2 pr-1">
        <ListSectionHeader className="min-w-0 flex-1 pb-0">{`Sessions (${count})`}</ListSectionHeader>
        <PillButton
          label={shown ? "Hide" : "Show all"}
          accessibilityLabel={shown ? "Hide sessions" : "Show all sessions"}
          onPress={() => setShown((s) => !s)}
        />
      </View>
      {shown ? children : null}
    </View>
  );
}

export function SeasonDetailView({
  season,
  today,
  actions,
  nextStep,
  sessions,
  onOpenGroup,
  extra,
}: {
  season: SeasonDetail;
  /** The org's day key, or the phone's. */
  today: string;
  actions: SeasonAction[];
  nextStep?: ReactNode;
  sessions: ReactNode;
  onOpenGroup?: (id: number) => void;
  extra?: ReactNode;
}) {
  return (
    <View className="flex-col gap-6">
      <View className="flex-col gap-3">
        <SeasonSummary season={season} today={today} />
        <Figures season={season} />
      </View>
      {nextStep}
      {actions.length > 0 ? (
        <View className="flex-col gap-2">
          <ListSectionHeader className="pb-0">Manage</ListSectionHeader>
          <ActionGrid actions={actions} />
        </View>
      ) : null}
      {season.groups.length > 0 ? (
        <GroupedList header={`Groups (${season.groups.length})`}>
          {season.groups.map((g) => (
            <ListRow
              key={g.id}
              title={g.name}
              subtitle={joinMeta([
                countOf(g.studentCount, "student"),
                g.leaderNames.length ? `Leaders: ${g.leaderNames.join(", ")}` : "No leader yet",
              ])}
              chevron={onOpenGroup !== undefined}
              onPress={onOpenGroup ? () => onOpenGroup(g.id) : undefined}
            />
          ))}
        </GroupedList>
      ) : null}
      <Sessions count={season.sessionCount}>{sessions}</Sessions>
      {extra}
    </View>
  );
}
