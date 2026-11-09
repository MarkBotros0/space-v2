/**
 * One day of the month view, opened by tapping anywhere on its cell (owner,
 * 2026-11-07: hitting a 2pt colour bar inside a 40dp cell was too fiddly).
 * Every session and event that day as full rows, each opening as it does in
 * Upcoming.
 */
import { CalendarDays } from "lucide-react-native";
import { useRef } from "react";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

import { formatWeekdayDayYear } from "../../lib/format";
import { EmptyState } from "../ui/empty-state";
import { GroupedList } from "../ui/grouped-list";
import { Sheet } from "../ui/sheet";
import { AgendaEvent, AgendaSession } from "./season-calendar-agenda";
import type { Handlers } from "./season-colors";

export function DaySheet({
  day,
  sessions,
  events,
  today,
  onClose,
  ...handlers
}: {
  /** The day shown; null closes the sheet. */
  day: string | null;
  sessions: SessionListItem[];
  events: JpcEventListItem[];
  today: string;
  onClose: () => void;
} & Handlers) {
  // The last day stays on the sheet while it slides away.
  const last = useRef(day);
  if (day !== null) last.current = day;
  const shown = last.current;
  const daySessions = shown ? sessions.filter((s) => s.dayKey === shown) : [];
  const dayEvents = shown ? events.filter((e) => e.dayKey === shown) : [];
  const open = (fn: () => void) => {
    onClose();
    fn();
  };
  return (
    <Sheet open={day !== null} onClose={onClose} title={shown ? formatWeekdayDayYear(shown) : undefined}>
      {daySessions.length + dayEvents.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nothing on this day" description="No sessions or events." />
      ) : (
        <GroupedList>
          {daySessions.map((s) => (
            <AgendaSession
              key={`s${s.id}`}
              s={s}
              today={today}
              seasonColors={handlers.seasonColors}
              onOpenSession={(id) => open(() => handlers.onOpenSession(id))}
            />
          ))}
          {dayEvents.map((e) => (
            <AgendaEvent key={`e${e.id}`} e={e} onOpenEvent={(ev) => open(() => handlers.onOpenEvent(ev))} />
          ))}
        </GroupedList>
      )}
    </Sheet>
  );
}
