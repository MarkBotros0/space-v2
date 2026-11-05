import { format } from "date-fns";
import { useRouter } from "expo-router";
import type { JpcEventListItem } from "@space/shared";

import { ListRow, StatusChip, type ChipSpec } from "../../design/ui";
import { formatDayKey, formatWallTime } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";
import { VISIBILITY_LABELS } from "../../components/EventForm";

/** The event's last org day is before today (device calendar day; the server sends no past flag). */
export function isPastEvent(e: { dayKey: string; endDayKey: string | null }, today = new Date()) {
  return (e.endDayKey ?? e.dayKey) < format(today, "yyyy-MM-dd");
}

/** One chip at most: a past event says so, else who can see it when that is not everyone. */
export function eventChip(e: JpcEventListItem, today = new Date()): ChipSpec | null {
  if (isPastEvent(e, today)) return { tone: "neutral", label: "Past" };
  if (e.visibility === "ALUMNI_ONLY") return { tone: "warn", label: VISIBILITY_LABELS.ALUMNI_ONLY };
  if (e.visibility === "SEASON")
    return { tone: "info", label: e.seasonCode ?? VISIBILITY_LABELS.SEASON };
  return null;
}

/** "Jul 1, 2099 – Jul 5, 2099" then the time: built from the server's org-clock strings only (X13). */
export function eventMeta(e: JpcEventListItem): string {
  const days =
    e.endDayKey && e.endDayKey !== e.dayKey
      ? `${formatDayKey(e.dayKey)} – ${formatDayKey(e.endDayKey)}`
      : formatDayKey(e.dayKey);
  return joinMeta([days, e.time === null ? null : formatWallTime(e.time)]);
}

export function EventListRow({ event, index }: { event: JpcEventListItem; index?: number }) {
  const router = useRouter();
  const chip = eventChip(event);
  return (
    <ListRow
      index={index}
      title={event.title}
      titleLines={2}
      subtitle={eventMeta(event)}
      subtitleLines={3}
      trailing={chip ? <StatusChip {...chip} /> : undefined}
      chevron
      onPress={() => router.push({ pathname: "/event/[id]", params: { id: String(event.id) } })}
    />
  );
}
