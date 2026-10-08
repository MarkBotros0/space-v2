import { View } from "react-native";
import { useRouter } from "expo-router";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

import { formatWallTime } from "../../lib/format";
import { sessionBadge, sessionTone, type DayContents, type SessionTone } from "../../lib/calendar-grid";
import type { CalendarEntry } from "../../lib/day-groups";
import { useTheme, type Theme } from "../../theme";
import { Card, Text } from "../../ui";

/** What a card needs to colour and badge itself (REG-76). */
export interface CalendarContext {
  /** The org day "today" is measured against. */
  today: string;
  /** Season code -> v1 palette slot; only set when several seasons share the calendar. */
  slots: Record<string, number> | null;
  /** Staff see Attendance marked/pending; a student has nothing to mark. */
  isStaff: boolean;
}

export interface Tint {
  background: string;
  foreground: string;
}

/** v1's five-colour SEASON_PALETTE, as light-theme pairs. */
export function seasonTint(theme: Theme, slot: number): Tint {
  const c = theme.colors;
  const pairs: Tint[] = [
    { background: c.info[100], foreground: c.info[800] },
    { background: c.success[100], foreground: c.success[800] },
    { background: c.warning[100], foreground: c.warning[800] },
    { background: c.error[100], foreground: c.error[800] },
    { background: c.brand.navy[100], foreground: c.brand.navy[800] },
  ];
  return pairs[slot % pairs.length] as Tint;
}

/** v1's single-season cue: today green, past muted, upcoming teal. */
export function toneTint(theme: Theme, tone: SessionTone): Tint {
  const c = theme.colors;
  if (tone === "today") return { background: c.success[100], foreground: c.success[800] };
  if (tone === "past") return { background: c.neutral[100], foreground: c.neutral[600] };
  return { background: c.brand.teal[100], foreground: c.brand.teal[800] };
}

/** v1's event chip: alumni-only warm, everything else navy. */
export function eventTint(theme: Theme, e: Pick<JpcEventListItem, "visibility">): Tint {
  const c = theme.colors;
  return e.visibility === "ALUMNI_ONLY"
    ? { background: c.warning[100], foreground: c.warning[800] }
    : { background: c.brand.navy[100], foreground: c.brand.navy[800] };
}

export function sessionTint(theme: Theme, s: SessionListItem, ctx: CalendarContext): Tint {
  const slot = ctx.slots?.[s.seasonCode];
  return slot !== undefined ? seasonTint(theme, slot) : toneTint(theme, sessionTone(s.dayKey, ctx.today));
}

export function Chip({ label, tint }: { label: string; tint: Tint }) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: tint.background,
        borderRadius: theme.radii.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 2,
      }}
    >
      <Text variant="caption" color={tint.foreground}>
        {label}
      </Text>
    </View>
  );
}

function SessionCard({ s, ctx }: { s: SessionListItem; ctx: CalendarContext }) {
  const theme = useTheme();
  const router = useRouter();
  const tint = sessionTint(theme, s, ctx);
  const badge = sessionBadge(s, ctx.today, ctx.isStaff);
  return (
    <Card
      style={{
        marginTop: theme.spacing.sm,
        backgroundColor: tint.background,
        borderLeftWidth: theme.spacing.xs,
        borderLeftColor: tint.foreground,
      }}
      onPress={() => router.push({ pathname: "/session/[id]", params: { id: String(s.id) } })}
    >
      <Text variant="body" color={tint.foreground}>
        {s.title}
      </Text>
      <Text variant="label" color={tint.foreground}>
        {s.location ? `${formatWallTime(s.startTime)} · ${s.location}` : formatWallTime(s.startTime)}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs, marginTop: theme.spacing.xs }}>
        {badge ? <Chip label={badge} tint={{ background: theme.colors.white, foreground: tint.foreground }} /> : null}
        {ctx.slots ? <Chip label={s.seasonTitle} tint={tint} /> : null}
      </View>
    </Card>
  );
}

function EventCard({ e }: { e: JpcEventListItem }) {
  const theme = useTheme();
  const router = useRouter();
  const tint = eventTint(theme, e);
  return (
    <Card
      style={{
        marginTop: theme.spacing.sm,
        backgroundColor: tint.background,
        borderLeftWidth: theme.spacing.xs,
        borderLeftColor: tint.foreground,
      }}
      onPress={() => router.push({ pathname: "/event/[id]", params: { id: String(e.id) } })}
    >
      <Text variant="body" color={tint.foreground}>
        {e.title}
      </Text>
      <Text variant="label" color={tint.foreground}>
        {e.time ? `JPC event · ${formatWallTime(e.time)}` : "JPC event · All day"}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs, marginTop: theme.spacing.xs }}>
        {e.visibility === "ALUMNI_ONLY" ? (
          <Chip label="Alumni only" tint={{ background: theme.colors.white, foreground: tint.foreground }} />
        ) : null}
        {e.seasonCode ? <Chip label={e.seasonCode} tint={tint} /> : null}
      </View>
    </Card>
  );
}

/** A bucket's sessions and events as time-ordered entries. */
export function entriesFor(day: DayContents | undefined): CalendarEntry[] {
  if (!day) return [];
  const entries: CalendarEntry[] = [
    ...day.sessions.map((session) => ({ kind: "session" as const, at: Date.parse(session.startsAt), session })),
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
  const theme = useTheme();
  const items: { label: string; tint: Tint }[] = slots
    ? Object.entries(slots).map(([code, slot]) => ({ label: code, tint: seasonTint(theme, slot) }))
    : [
        { label: "Today", tint: toneTint(theme, "today") },
        { label: "Upcoming", tint: toneTint(theme, "upcoming") },
        { label: "Past", tint: toneTint(theme, "past") },
      ];
  return (
    <View
      accessibilityLabel="Calendar legend"
      style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs, marginBottom: theme.spacing.md }}
    >
      {items.map((i) => (
        <Chip key={i.label} label={i.label} tint={i.tint} />
      ))}
      <Chip label="JPC event" tint={eventTint(theme, { visibility: "ALL" })} />
      <Chip label="Alumni only" tint={eventTint(theme, { visibility: "ALUMNI_ONLY" })} />
    </View>
  );
}
