import { useRouter } from "expo-router";
import type { JpcEventListItem } from "@space/shared";

import { ListRow, StatusChip, type ChipSpec } from "../../design/ui";
import { formatEventWhen } from "../../lib/format";
import { VISIBILITY_LABELS } from "../../components/EventForm";

/** At most one chip: Past wins; otherwise who can see it when that is not everyone (Alumni only, or the season code). */
export function eventChip(e: JpcEventListItem): ChipSpec | null {
  if (e.isPast) return { tone: "neutral", label: "Past" };
  if (e.visibility === "ALUMNI_ONLY") return { tone: "warn", label: VISIBILITY_LABELS.ALUMNI_ONLY };
  if (e.visibility === "SEASON")
    return { tone: "info", label: e.seasonCode ?? VISIBILITY_LABELS.SEASON };
  return null;
}

export function EventListRow({ event, index }: { event: JpcEventListItem; index?: number }) {
  const router = useRouter();
  const chip = eventChip(event);
  return (
    <ListRow
      index={index}
      title={event.title}
      titleLines={2}
      subtitle={formatEventWhen(event)}
      subtitleLines={3}
      trailing={chip ? <StatusChip {...chip} /> : undefined}
      chevron
      onPress={() => router.push({ pathname: "/event/[id]", params: { id: String(event.id) } })}
    />
  );
}
