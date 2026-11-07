/**
 * season-calendar's Upcoming view: one grouped list per day, headed by the day
 * (the server's org day), a row per session or event. A session's chip is
 * `sessionChip`, so "in 6 days" reads the same here as on Today.
 */
import { Calendar as CalendarIcon, ExternalLink } from "lucide-react-native";
import { View } from "react-native";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

import { groupCalendarByDay } from "../../lib/day-groups";
import { formatLongDay, formatWallTime, formatMinutes } from "../../lib/format";
import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { EmptyState } from "../ui/empty-state";
import { GroupedList, ListRow } from "../ui/grouped-list";
import { StatusChip } from "../ui/status-chip";
import { Text } from "../ui/text";
import { FALLBACK_SEASON, type Handlers, type SeasonColors } from "./season-colors";
import { sessionChip } from "./session-chip";

iconWithClassName(CalendarIcon, ExternalLink);

/** SUPER's all-seasons mode: the season code in its own colour, left of the title. */
function SeasonTag({ code, colors }: { code: string; colors: SeasonColors }) {
  const c = colors[code] ?? FALLBACK_SEASON;
  return (
    <View className={cn("rounded-control px-2 py-1", c.box)}>
      <Text variant="caption" className={cn("font-medium", c.text)}>
        {code}
      </Text>
    </View>
  );
}

export function AgendaSession({
  s,
  today,
  onOpenSession,
  seasonColors,
}: {
  s: SessionListItem;
  today: string;
  onOpenSession: (id: number) => void;
  seasonColors?: SeasonColors;
}) {
  const chip = sessionChip(s, today, false);
  const where = s.location ? ` · ${s.location}` : "";
  return (
    <ListRow
      title={s.title}
      titleLines={2}
      subtitle={`${formatWallTime(s.startTime)} · ${formatMinutes(s.durationMinutes)}${where}`}
      // The chips sit under the text and wrap: beside it they left the title "Week 2: Cal…" (sweep R5).
      footer={
        seasonColors || chip ? (
          <>
            {seasonColors ? <SeasonTag code={s.seasonCode} colors={seasonColors} /> : null}
            {chip ? <StatusChip {...chip} /> : null}
          </>
        ) : undefined
      }
      trailingLabel={chip?.label}
      chevron
      onPress={() => onOpenSession(s.id)}
    />
  );
}

export function AgendaEvent({
  e,
  onOpenEvent,
}: {
  e: JpcEventListItem;
  onOpenEvent: (e: JpcEventListItem) => void;
}) {
  return (
    <ListRow
      title={e.title}
      titleLines={2}
      subtitle={e.visibility === "ALUMNI_ONLY" ? "JPC event · Alumni only" : "JPC event"}
      leading={<CalendarIcon size={18} className="text-muted-foreground" />}
      trailing={e.url ? <ExternalLink size={16} className="text-muted-foreground" /> : undefined}
      trailingLabel={e.url ? "Opens a link" : undefined}
      onPress={() => onOpenEvent(e)}
    />
  );
}

export function AgendaView({
  sessions,
  events,
  today,
  ...handlers
}: { sessions: SessionListItem[]; events: JpcEventListItem[]; today: string } & Handlers) {
  const groups = groupCalendarByDay(
    sessions.filter((s) => s.dayKey >= today),
    events.filter((e) => e.dayKey >= today),
  );
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={CalendarIcon}
        title="Nothing coming up"
        description="You're all caught up. Switch to Month to review past sessions."
      />
    );
  }
  return (
    <View className="flex-col gap-5">
      {groups.map((group) => (
        <GroupedList key={group.dayKey} header={formatLongDay(group.dayKey)}>
          {group.entries.map((entry) =>
            entry.kind === "session" ? (
              <AgendaSession
                key={`s${entry.session.id}`}
                s={entry.session}
                today={today}
                onOpenSession={handlers.onOpenSession}
                seasonColors={handlers.seasonColors}
              />
            ) : (
              <AgendaEvent
                key={`e${entry.event.id}`}
                e={entry.event}
                onOpenEvent={handlers.onOpenEvent}
              />
            ),
          )}
        </GroupedList>
      ))}
    </View>
  );
}
