/**
 * Port of v1 src/components/seasons/season-detail.tsx as grouped rows: a
 * SegmentedControl (Overview / Groups / Sessions, no counts in the labels so
 * the strip fits a 360dp phone at font 1.3). Overview = Status, Dates and
 * Enrollment rows, the About text, a "Manage" list the caller supplies, then
 * the caller's extra cards; Groups = a row per group ("{n} students" and
 * "Leaders: …") or v1's empty state; Sessions is the caller's slot
 * (CalendarList). The long About text is a Text block, since a ListRow title
 * is one line.
 */
import type { SeasonDetail } from "@space/shared";
import { useState, type ReactNode } from "react";
import { View } from "react-native";

import { formatSeasonDay } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";
import { countOf } from "../../lib/plural";
import { NAV_ICONS } from "../icons/nav-icon";
import { EmptyState } from "../ui/empty-state";
import { GroupedList, ListRow } from "../ui/grouped-list";
import { SegmentedControl } from "../ui/segmented-control";
import { StatusChip, statusChip } from "../ui/status-chip";
import { Text } from "../ui/text";

type Segment = "overview" | "groups" | "sessions";

const SEGMENTS = [
  { value: "overview", label: "Overview" },
  { value: "groups", label: "Groups" },
  { value: "sessions", label: "Sessions" },
];

export type ManageItem = { label: string; onPress: () => void };

export function SeasonDetailView({
  season,
  manage,
  overviewExtra,
  sessionsTab,
  onOpenGroup,
  groupsAction,
}: {
  season: SeasonDetail;
  /** The "Manage" rows, each with a chevron; none renders no list. */
  manage?: ManageItem[];
  overviewExtra?: ReactNode;
  sessionsTab: ReactNode;
  onOpenGroup?: (id: number) => void;
  groupsAction?: ReactNode;
}) {
  const [segment, setSegment] = useState<Segment>("overview");
  const groupCount = season.groups.length;

  return (
    <View className="flex-col gap-4">
      <SegmentedControl
        options={SEGMENTS}
        value={segment}
        onChange={(v) => setSegment(v as Segment)}
      />

      {segment === "overview" ? (
        <View className="flex-col gap-4">
          <GroupedList>
            <ListRow
              title="Status"
              trailing={<StatusChip {...statusChip("season", season.status)} />}
            />
            <ListRow
              title="Dates"
              subtitle={`${formatSeasonDay(season.startDate)} – ${formatSeasonDay(season.endDate)}`}
            />
            <ListRow
              title="Enrollment"
              subtitle={`${countOf(season.studentCount, "student")} in ${countOf(groupCount, "group")}`}
            />
          </GroupedList>
          {season.description ? (
            <View className="flex-col gap-1 px-4">
              <Text variant="subhead" className="text-muted-foreground">
                About
              </Text>
              <Text variant="body" className="text-foreground">
                {season.description}
              </Text>
            </View>
          ) : null}
          {manage && manage.length > 0 ? (
            <GroupedList header="Manage">
              {manage.map((item) => (
                <ListRow key={item.label} title={item.label} chevron onPress={item.onPress} />
              ))}
            </GroupedList>
          ) : null}
          {overviewExtra}
        </View>
      ) : null}

      {segment === "groups" ? (
        groupCount === 0 ? (
          <EmptyState
            icon={NAV_ICONS.groups}
            title="No groups yet"
            description="Add groups so students can be placed and leaders assigned."
            action={groupsAction}
          />
        ) : (
          <View className="flex-col gap-4">
            <GroupedList header={countOf(groupCount, "group")}>
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
            {groupsAction ? <View className="items-center">{groupsAction}</View> : null}
          </View>
        )
      ) : null}

      {segment === "sessions" ? sessionsTab : null}
    </View>
  );
}
