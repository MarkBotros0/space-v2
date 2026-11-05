import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

import { formatWallTime } from "../../lib/format";
import {
  sessionBadge,
  sessionTone,
  type DayContents,
  type SessionTone,
} from "../../lib/calendar-grid";
import type { CalendarEntry } from "../../lib/day-groups";
import { cn } from "../../design/lib/cn";
import { Text } from "../../design/ui/text";

/** What a card needs to colour and badge itself (REG-76). */
export interface CalendarContext {
  /** The org day "today" is measured against. */
  today: string;
  /** Season code -> v1 palette slot; only set when several seasons share the calendar. */
  slots: Record<string, number> | null;
  /** Staff see Attendance marked/pending; a student has nothing to mark. */
  isStaff: boolean;
}

/** A tint as NativeWind classes: card/chip background, text, the card's left rule, and the month dot. */
export interface Tint {
  box: string;
  text: string;
  border: string;
  dot: string;
}

/** Light: the 100/800 pairs the legacy calendar used; dark: 950/200, as the design calendar's chips. */
const SEASON_TINTS: Tint[] = [
  {
    box: "bg-info-100 dark:bg-info-950",
    text: "text-info-800 dark:text-info-200",
    border: "border-l-info-800 dark:border-l-info-400",
    dot: "bg-info-800 dark:bg-info-400",
  },
  {
    box: "bg-success-100 dark:bg-success-950",
    text: "text-success-800 dark:text-success-200",
    border: "border-l-success-800 dark:border-l-success-400",
    dot: "bg-success-800 dark:bg-success-400",
  },
  {
    box: "bg-warning-100 dark:bg-warning-950",
    text: "text-warning-800 dark:text-warning-200",
    border: "border-l-warning-800 dark:border-l-warning-400",
    dot: "bg-warning-800 dark:bg-warning-400",
  },
  {
    box: "bg-error-100 dark:bg-error-950",
    text: "text-error-800 dark:text-error-200",
    border: "border-l-error-800 dark:border-l-error-400",
    dot: "bg-error-800 dark:bg-error-400",
  },
  {
    box: "bg-brand-navy-100 dark:bg-brand-navy-900",
    text: "text-brand-navy-800 dark:text-brand-navy-100",
    border: "border-l-brand-navy-800 dark:border-l-brand-navy-300",
    dot: "bg-brand-navy-800 dark:bg-brand-navy-300",
  },
];

/** v1's five-colour SEASON_PALETTE, as tinted pairs. */
export function seasonTint(slot: number): Tint {
  return SEASON_TINTS[slot % SEASON_TINTS.length]!;
}

const TONE_TINTS: Record<SessionTone, Tint> = {
  today: SEASON_TINTS[1]!,
  past: {
    box: "bg-muted",
    text: "text-muted-foreground",
    border: "border-l-muted-foreground",
    dot: "bg-muted-foreground",
  },
  upcoming: {
    box: "bg-brand-teal-100 dark:bg-brand-teal-950",
    // teal-900 (7.7:1 on teal-100); teal-800 sat at 4.6.
    text: "text-brand-teal-900 dark:text-brand-teal-200",
    border: "border-l-brand-teal-800 dark:border-l-brand-teal-400",
    dot: "bg-brand-teal-800 dark:bg-brand-teal-400",
  },
};

/** v1's single-season cue: today green, past muted, upcoming teal. */
export function toneTint(tone: SessionTone): Tint {
  return TONE_TINTS[tone];
}

/** v1's event chip: alumni-only warm, everything else navy. */
export function eventTint(e: Pick<JpcEventListItem, "visibility">): Tint {
  return e.visibility === "ALUMNI_ONLY" ? SEASON_TINTS[2]! : SEASON_TINTS[4]!;
}

export function sessionTint(s: SessionListItem, ctx: CalendarContext): Tint {
  const slot = ctx.slots?.[s.seasonCode];
  return slot !== undefined ? seasonTint(slot) : toneTint(sessionTone(s.dayKey, ctx.today));
}

/** A badge chip inside a card: the tint's text on the card background. */
function onCard(tint: Tint): Pick<Tint, "box" | "text"> {
  return { box: "bg-card", text: tint.text };
}

/** 12px text on a tint: medium weight, since regular strokes antialiased to ~3:1 on device. */
export function Chip({ label, tint }: { label: string; tint: Pick<Tint, "box" | "text"> }) {
  return (
    <View testID={`chip-${label}`} className={cn("self-start rounded-full px-2 py-0.5", tint.box)}>
      <Text className={cn("text-xs font-medium", tint.text)}>{label}</Text>
    </View>
  );
}

function EntryCard({
  tint,
  title,
  subtitle,
  chips,
  onPress,
}: {
  tint: Tint;
  title: string;
  subtitle: string;
  chips: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={cn("mt-2 rounded-group border-l-4 p-4 active:opacity-90", tint.box, tint.border)}
    >
      <Text className={tint.text}>{title}</Text>
      <Text className={cn("text-sm font-medium", tint.text)}>{subtitle}</Text>
      <View className="mt-1 flex-row flex-wrap gap-1">{chips}</View>
    </Pressable>
  );
}

function SessionCard({ s, ctx }: { s: SessionListItem; ctx: CalendarContext }) {
  const router = useRouter();
  const tint = sessionTint(s, ctx);
  const badge = sessionBadge(s, ctx.today, ctx.isStaff);
  return (
    <EntryCard
      tint={tint}
      title={s.title}
      subtitle={
        s.location ? `${formatWallTime(s.startTime)} · ${s.location}` : formatWallTime(s.startTime)
      }
      onPress={() => router.push({ pathname: "/session/[id]", params: { id: String(s.id) } })}
      chips={
        <>
          {badge ? <Chip label={badge} tint={onCard(tint)} /> : null}
          {ctx.slots ? <Chip label={s.seasonTitle} tint={tint} /> : null}
        </>
      }
    />
  );
}

function EventCard({ e }: { e: JpcEventListItem }) {
  const router = useRouter();
  const tint = eventTint(e);
  return (
    <EntryCard
      tint={tint}
      title={e.title}
      subtitle={e.time ? `JPC event · ${formatWallTime(e.time)}` : "JPC event · All day"}
      onPress={() => router.push({ pathname: "/event/[id]", params: { id: String(e.id) } })}
      chips={
        <>
          {e.visibility === "ALUMNI_ONLY" ? <Chip label="Alumni only" tint={onCard(tint)} /> : null}
          {e.seasonCode ? <Chip label={e.seasonCode} tint={tint} /> : null}
        </>
      }
    />
  );
}

/** A bucket's sessions and events as time-ordered entries. */
export function entriesFor(day: DayContents | undefined): CalendarEntry[] {
  if (!day) return [];
  const entries: CalendarEntry[] = [
    ...day.sessions.map((session) => ({
      kind: "session" as const,
      at: Date.parse(session.startsAt),
      session,
    })),
    ...day.events.map((event) => ({ kind: "event" as const, at: Date.parse(event.date), event })),
  ];
  return entries.sort((a, b) => a.at - b.at);
}

/** One day's cards in time order (instants compare zone-independently). */
export function DayEntries({ entries, ctx }: { entries: CalendarEntry[]; ctx: CalendarContext }) {
  return (
    <>
      {entries.map((entry) =>
        entry.kind === "session" ? (
          <SessionCard key={`s${entry.session.id}`} s={entry.session} ctx={ctx} />
        ) : (
          <EventCard key={`e${entry.event.id}`} e={entry.event} />
        ),
      )}
    </>
  );
}

/** What the colours mean: the season palette when several share the view, else today/upcoming/past. */
export function Legend({ slots }: { slots: Record<string, number> | null }) {
  const items: { label: string; tint: Tint }[] = slots
    ? Object.entries(slots).map(([code, slot]) => ({ label: code, tint: seasonTint(slot) }))
    : [
        { label: "Today", tint: toneTint("today") },
        { label: "Upcoming", tint: toneTint("upcoming") },
        { label: "Past", tint: toneTint("past") },
      ];
  return (
    <View accessibilityLabel="Calendar legend" className="mb-4 flex-row flex-wrap gap-1">
      {items.map((i) => (
        <Chip key={i.label} label={i.label} tint={i.tint} />
      ))}
      <Chip label="JPC event" tint={eventTint({ visibility: "ALL" })} />
      <Chip label="Alumni only" tint={eventTint({ visibility: "ALUMNI_ONLY" })} />
    </View>
  );
}
