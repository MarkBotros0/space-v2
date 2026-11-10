import { useRouter } from "expo-router";
import { Calendar as CalendarIcon } from "lucide-react-native";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

import { SeasonCalendar, type SeasonColors } from "../../../design/sessions/season-calendar";
import { EmptyState } from "../../../design/ui";
import { deviceTodayKey, initialAnchor } from "../../../lib/calendar-grid";

export function sessionCount(n: number): string {
  return `${n} ${n === 1 ? "session" : "sessions"}`;
}

export function NothingScheduled() {
  return (
    <EmptyState
      icon={CalendarIcon}
      title="Nothing scheduled yet"
      description="Sessions and events will appear here once they're added."
    />
  );
}

/**
 * v1's SeasonCalendar opened on its anchor (the next session's day, else the
 * last, else today): Month shows that day's month, Week that day's week; with a
 * tap on a session or an event opening its detail page.
 */
export function RoutedSeasonCalendar({
  sessions,
  events,
  seasonColors,
  today: serverToday,
}: {
  sessions: SessionListItem[];
  events: JpcEventListItem[];
  seasonColors?: SeasonColors;
  /** The org's today, from the server. Without it, the device's. */
  today?: string;
}) {
  const router = useRouter();
  const today = serverToday ?? deviceTodayKey();
  return (
    <SeasonCalendar
      sessions={sessions}
      events={events}
      today={today}
      initialAnchor={initialAnchor(sessions, today)}
      seasonColors={seasonColors}
      onOpenSession={(id) => router.push({ pathname: "/session/[id]", params: { id: String(id) } })}
      onOpenEvent={(e) => router.push({ pathname: "/event/[id]", params: { id: String(e.id) } })}
    />
  );
}
