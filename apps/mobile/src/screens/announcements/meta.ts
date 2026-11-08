import { format, isValid, parseISO } from "date-fns";

/**
 * "Name · 3 Nov", plus "· Edited" once changed; a deleted account reads "Former member".
 * `long` is the post's own page: "Name · 3 Nov 2026, 18:40".
 */
export function announcementMeta(
  p: { authorName: string | null; createdAt: string; editedAt: string | null },
  long = false,
): string {
  const date = parseISO(p.createdAt);
  return [
    p.authorName ?? "Former member",
    isValid(date) ? format(date, long ? "d MMM yyyy, HH:mm" : "d MMM") : "—",
    p.editedAt ? "Edited" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
