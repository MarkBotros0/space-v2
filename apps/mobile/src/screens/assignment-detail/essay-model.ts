// The essay part's live count, pure so its words are tested apart from the screen.
import { plural } from "../../lib/plural";
import { keepTogether } from "../../lib/format";

/** A word joiner each side of the dash, so "150–300" never breaks after it. */
const JOINED_DASH = "⁠–⁠";
/** A non-breaking space each side of the dot: the count and the range are one run (spec "UI and code standards"). */
const JOINED_DOT = " · ";

/** "150–300", "at least 150", "up to 300", or null when the essay sets no limits. */
function rangeText(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) return `${min}${JOINED_DASH}${max}`;
  if (min !== null) return keepTogether(`at least ${min}`);
  if (max !== null) return keepTogether(`up to ${max}`);
  return null;
}

/**
 * The caption under the essay box: "142 words · 150–300" as one unbreakable
 * run, or "8 over the limit" in the bad tone once it is past the maximum (words
 * as well as colour). Under the minimum it stays the plain count: a draft
 * grows, and the reason Hand in is held says how far there is to go.
 */
export function essayCountLine(
  words: number,
  min: number | null,
  max: number | null,
): { text: string; tone: "muted" | "bad" } {
  if (max !== null && words > max) return { text: `${words - max} over the limit`, tone: "bad" };
  const count = keepTogether(plural(words, "word"));
  const range = rangeText(min, max);
  return { text: range === null ? count : `${count}${JOINED_DOT}${range}`, tone: "muted" };
}
