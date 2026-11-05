/** season-calendar's Upcoming view: day-grouped rows with v1's time rail. */
import {
  Calendar as CalendarIcon,
  ChevronRight,
  ExternalLink,
  Lock,
  MapPin,
} from "lucide-react-native";
import { Pressable, View } from "react-native";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

import { dayCue } from "../../lib/calendar-grid";
import { groupCalendarByDay } from "../../lib/day-groups";
import { formatLongDay, splitWallTime } from "../../lib/format";
import { Eyebrow } from "../layout/page-title";
import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { EmptyState } from "../ui/empty-state";
import { Text } from "../ui/text";
import { FALLBACK_SEASON, type Handlers, type SeasonColors } from "./season-colors";

iconWithClassName(CalendarIcon, ChevronRight, ExternalLink, Lock, MapPin);

function TimeRail({ time }: { time: string | null }) {
  const { clock, meridiem } = splitWallTime(time);
  return (
    <View className="w-12 shrink-0 flex-col items-center justify-center">
      <Text className="text-sm font-bold leading-none text-foreground">{clock}</Text>
      <Text className="mt-0.5 text-caption uppercase text-muted-foreground">{meridiem}</Text>
    </View>
  );
}

const ROW =
  "flex-row items-center gap-3 rounded-group bg-surface dark:border dark:border-separator p-3 active:bg-accent";

function AgendaSession({
  s,
  onOpenSession,
  seasonColors,
}: {
  s: SessionListItem;
  onOpenSession: (id: number) => void;
  seasonColors?: SeasonColors;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => onOpenSession(s.id)}
      className={ROW}
    >
      <TimeRail time={s.startTime} />
      <View className="h-10 w-px shrink-0 bg-border" />
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          className="text-sm font-semibold text-brand-navy-900 dark:text-foreground"
        >
          {s.title}
        </Text>
        <View className="flex-row flex-wrap items-center gap-x-2">
          <Text className="text-xs text-muted-foreground">{`${s.durationMinutes} min`}</Text>
          {s.location ? (
            <View className="flex-row items-center gap-1">
              <MapPin size={12} className="shrink-0 text-muted-foreground" />
              <Text className="text-xs text-muted-foreground">{s.location}</Text>
            </View>
          ) : null}
          {seasonColors ? (
            <View
              className={cn(
                "rounded px-1.5 py-0.5",
                (seasonColors[s.seasonCode] ?? FALLBACK_SEASON).box,
              )}
            >
              <Text
                className={cn(
                  "text-caption font-medium",
                  (seasonColors[s.seasonCode] ?? FALLBACK_SEASON).text,
                )}
              >
                {s.seasonCode}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
    </Pressable>
  );
}

function AgendaEvent({
  e,
  onOpenEvent,
}: {
  e: JpcEventListItem;
  onOpenEvent: (e: JpcEventListItem) => void;
}) {
  return (
    <Pressable
      accessibilityRole={e.url ? "link" : "button"}
      onPress={() => onOpenEvent(e)}
      className={ROW}
    >
      <View className="w-12 shrink-0 items-center justify-center">
        <CalendarIcon size={16} className="text-muted-foreground" />
      </View>
      <View className="h-10 w-px shrink-0 bg-border" />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          {e.visibility === "ALUMNI_ONLY" ? (
            <Lock size={12} className="shrink-0 text-brand-navy-900 dark:text-foreground" />
          ) : null}
          <Text
            numberOfLines={1}
            className="shrink text-sm font-semibold text-brand-navy-900 dark:text-foreground"
          >
            {e.title}
          </Text>
        </View>
        <Text className="text-xs text-muted-foreground">JPC event</Text>
      </View>
      {e.url ? <ExternalLink size={16} className="shrink-0 text-muted-foreground" /> : null}
    </Pressable>
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
      {groups.map((group) => {
        const cue = dayCue(group.dayKey, today);
        return (
          <View key={group.dayKey} className="flex-col gap-2">
            <View className="flex-row items-baseline justify-between gap-2">
              <Eyebrow>{formatLongDay(group.dayKey)}</Eyebrow>
              {cue ? (
                <Text className="text-caption font-medium text-brand-teal-700 dark:text-brand-teal-300">
                  {cue}
                </Text>
              ) : null}
            </View>
            {group.entries.map((entry) =>
              entry.kind === "session" ? (
                <AgendaSession
                  key={`s${entry.session.id}`}
                  s={entry.session}
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
          </View>
        );
      })}
    </View>
  );
}
