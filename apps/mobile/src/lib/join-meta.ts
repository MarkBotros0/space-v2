/** A part this short is one fact ("Last login Nov 16", "Group B", "2 pts"): it never splits across lines. */
const BIND_UP_TO = 28;
const NBSP = " ";

/** Holds a short part on one line; a long one (a title) still wraps between its words. */
function bind(part: string): string {
  return part.length <= BIND_UP_TO ? part.replace(/ /g, NBSP) : part;
}

/**
 * Joins the parts of a meta line with " · ", dropping empty, blank and falsy parts so no separator dangles.
 * At font 1.3 a line wraps only after a dot, never inside a short fact or before its dot ("Last login /
 * Nov 16", "Max / 2 pts" and a line starting "· …" were the whole-app sweep's M4, 2026-11-16).
 */
export function joinMeta(parts: (string | number | null | undefined | false)[]): string {
  const kept = parts
    .filter((p): p is string | number => p !== null && p !== undefined && p !== false)
    .map((p) => String(p).trim())
    .filter((p) => p !== "");
  // A lone part has no dot to strand; it wraps between its words like any sentence.
  return kept.length < 2 ? (kept[0] ?? "") : kept.map(bind).join(`${NBSP}· `);
}
