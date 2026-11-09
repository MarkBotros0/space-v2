/**
 * Port of v1 src/components/sessions/calendar-list.tsx (the season detail's
 * Sessions tab): one bordered card per session — title link, status badge
 * (Today / Attendance marked / Attendance pending / Upcoming), "Series" badge,
 * date line, location, and an outline "Mark attendance" button. Dates are the
 * server's org day and wall time (X13). v1's check-in controls are not drawn
 * here: the session screen owns them (gap note).
 */
import type { SessionListItem } from "@space/shared";
import { Calendar as CalendarIcon, MapPin } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { formatWallTime, formatWeekdayDayYear, formatMinutes } from "../../lib/format";
import { iconWithClassName } from "../lib/icon";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Text } from "../ui/text";

iconWithClassName(MapPin);

function todayKey(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function StatusBadge({ session, now, today }: { session: SessionListItem; now: Date; today?: string }) {
  const orgToday = today ?? todayKey(now);
  if (session.dayKey === orgToday) return <Badge variant="info">Today</Badge>;
  // On another day than the org's today, the day decides; the instant is for today only.
  const past = today !== undefined ? session.dayKey < today : new Date(session.startsAt).getTime() < now.getTime();
  if (past) {
    return session.attendanceMarked ? (
      <Badge variant="success">Attendance marked</Badge>
    ) : (
      <Badge variant="warning">Attendance pending</Badge>
    );
  }
  return <Badge variant="outline">Upcoming</Badge>;
}

export function CalendarList({
  sessions,
  onOpen,
  onMarkAttendance,
  onCreate,
  now = new Date(),
  today,
}: {
  sessions: SessionListItem[];
  onOpen: (id: number) => void;
  onMarkAttendance?: (id: number) => void;
  onCreate?: () => void;
  now?: Date;
  /** The org's today, from the server. Without it, the device's day. */
  today?: string;
}) {
  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={CalendarIcon}
        title="No sessions yet"
        description="Add sessions to the season calendar."
        action={onCreate ? <Button onPress={onCreate}>Add session</Button> : undefined}
      />
    );
  }
  return (
    <View className="flex-col gap-3">
      {sessions.map((s) => (
        <View key={s.id} className="flex-col gap-3 rounded-group bg-surface dark:border dark:border-separator p-4">
          <View className="flex-col gap-1">
            <View className="flex-row flex-wrap items-center gap-2">
              <Pressable accessibilityRole="link" onPress={() => onOpen(s.id)}>
                <Text className="text-base font-semibold text-foreground">{s.title}</Text>
              </Pressable>
              <StatusBadge session={s} now={now} today={today} />
              {s.recurrenceGroupId ? (
                <Badge variant="outline" textClassName="text-xs">
                  Series
                </Badge>
              ) : null}
            </View>
            <Text className="text-sm text-muted-foreground">
              {`${formatWeekdayDayYear(s.dayKey)} · ${formatWallTime(s.startTime)} · ${formatMinutes(s.durationMinutes)}`}
            </Text>
            {s.location ? (
              <View className="flex-row items-center gap-1.5">
                <MapPin size={14} className="text-muted-foreground" />
                <Text className="text-sm text-muted-foreground">{s.location}</Text>
              </View>
            ) : null}
          </View>
          {onMarkAttendance ? (
            <Button variant="outline" size="sm" className="self-start" onPress={() => onMarkAttendance(s.id)}>
              Mark attendance
            </Button>
          ) : null}
        </View>
      ))}
    </View>
  );
}
