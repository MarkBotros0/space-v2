/**
 * Alumni Events rows on the grouped list. A day is a header (the date, with
 * the "Today" / "in N days" cue beside it as text) over one GroupedList; an
 * entry is a ListRow whose chips are StatusChips. Every day, time and order
 * comes from the server's org-clock values (X13), never a device-zone format.
 */
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

import { dayCue, sessionBadge } from "../../lib/calendar-grid";
import type { CalendarDayGroup, CalendarEntry } from "../../lib/day-groups";
import { formatDayKey, formatWallTime } from "../../lib/format";
import { cn } from "../../design/lib/cn";
import { GroupedList, ListRow, ListSectionHeader, StatusChip, Text } from "../../design/ui";

function SessionRow({ s, today }: { s: SessionListItem; today: string }) {
  const router = useRouter();
  const badge = sessionBadge(s, today, false);
  const when = formatWallTime(s.startTime);
  return (
    <ListRow
      title={s.title}
      titleLines={2}
      subtitle={s.location ? `${when} · ${s.location}` : when}
      trailing={badge ? <StatusChip tone="neutral" label={badge} /> : undefined}
      chevron
      onPress={() => router.push({ pathname: "/session/[id]", params: { id: String(s.id) } })}
    />
  );
}

function EventRow({ e }: { e: JpcEventListItem }) {
  const router = useRouter();
  const base = e.time ? `JPC event · ${formatWallTime(e.time)}` : "JPC event · All day";
  // A second chip would crowd the row beside "Alumni only": the season code rides in the subtitle.
  return (
    <ListRow
      title={e.title}
      titleLines={2}
      subtitle={e.seasonCode ? `${base} · ${e.seasonCode}` : base}
      trailing={e.visibility === "ALUMNI_ONLY" ? <StatusChip tone="warn" label="Alumni only" /> : undefined}
      chevron
      onPress={() => router.push({ pathname: "/event/[id]", params: { id: String(e.id) } })}
    />
  );
}

/** One day's entries in a single grouped list; `today` only drives a session's badge. */
export function EventDayRows({ entries, today }: { entries: CalendarEntry[]; today: string }) {
  return (
    <GroupedList className="mt-1">
      {entries.map((entry) =>
        entry.kind === "session" ? (
          <SessionRow key={`s${entry.session.id}`} s={entry.session} today={today} />
        ) : (
          <EventRow key={`e${entry.event.id}`} e={entry.event} />
        ),
      )}
    </GroupedList>
  );
}

/** Upcoming: each day's header, its cue, then its rows. */
export function EventDayList({ groups, today }: { groups: CalendarDayGroup[]; today: string }) {
  return (
    <View className="flex-col gap-4">
      {groups.map((group) => {
        const cue = dayCue(group.dayKey, today);
        return (
          <View key={group.dayKey}>
            <View className="flex-row items-baseline justify-between gap-2">
              <ListSectionHeader className="min-w-0 flex-1">{formatDayKey(group.dayKey)}</ListSectionHeader>
              {cue ? (
                <Text
                  variant="caption"
                  className={cn(
                    "shrink-0 pb-1.5 pr-4",
                    group.dayKey === today ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {cue}
                </Text>
              ) : null}
            </View>
            <EventDayRows entries={group.entries} today={today} />
          </View>
        );
      })}
    </View>
  );
}
