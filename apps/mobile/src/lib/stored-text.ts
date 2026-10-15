import { plainTextToHtml } from "@space/shared";

// The tags v1's TipTap editor writes (and RichTextView's sanitiser keeps).
const MARKUP = /<\/?(p|br|strong|b|em|i|u|s|ul|ol|li|a|h[1-6]|blockquote|code|pre)(\s[^>]*)?\/?>/i;

/**
 * A stored rich-text column as displayable HTML. Assignment descriptions hold
 * both v1's TipTap HTML and v2's plain text (the v2 form has no editor), so
 * plain text is escaped and paragraphed rather than parsed: a brief like
 * "Read <intro>" must show its angle brackets, not lose them as tags.
 */
export function storedTextToHtml(stored: string): string {
  return MARKUP.test(stored) ? stored : plainTextToHtml(stored);
}
