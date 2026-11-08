import { format, isValid, parseISO } from "date-fns";

/** "Name · 3 Nov", plus "· Edited" once changed; a deleted account reads "Former member". */
export function announcementMeta(p: {
  authorName: string | null;
  createdAt: string;
  editedAt: string | null;
}): string {
  const date = parseISO(p.createdAt);
  return [
    p.authorName ?? "Former member",
    isValid(date) ? format(date, "d MMM") : "—",
    p.editedAt ? "Edited" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
