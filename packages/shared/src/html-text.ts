const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * THE escaper (ruling X2). Ruling C11 says nothing renders as HTML and every
 * mail interpolation escapes; this is what both halves of that call. The
 * backend reaches it only through apps/backend/src/lib/html.ts.
 *
 * Five characters, no whitelist, nothing to keep up to date — which is exactly
 * why the wire format for note bodies is plain text rather than sanitised
 * HTML. The hard part of sanitising is deciding what to KEEP, and nothing in
 * this product needs to keep any of it.
 */
export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/**
 * Plain text → the paragraph-wrapped, escaped HTML stored in a column v1 still
 * renders with dangerouslySetInnerHTML (EngagementNote.body here; forum bodies
 * in Plan 14).
 *
 * v2 cannot store raw text there without changing how v1 displays it, and must
 * not store anything a caller could turn into markup. Escaping and wrapping
 * each line in a paragraph satisfies both: v1 renders v2's text as prose, and
 * a body containing <script> arrives in an admin's browser as visible text.
 */
export function plainTextToHtml(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

const ENTITIES: [RegExp, string][] = [
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#0?39;/g, "'"],
  [/&apos;/g, "'"],
  [/&nbsp;/g, " "],
  [/&#160;/g, " "],
  // &amp; LAST. Decoding it first would turn the stored "&amp;lt;" — the
  // escaped form of the literal text "&lt;" — into "&lt;", which the next rule
  // would then decode into a live "<".
  [/&amp;/g, "&"],
];

/**
 * Stored HTML → plain text for the wire (ruling C11: sanitise on read for
 * everything already stored — every pre-migration row is TipTap HTML written
 * by v1). Block-level closers become newlines first so "<p>a</p><p>b</p>"
 * reads as two lines rather than "ab"; then all tags go.
 *
 * This is a presentation conversion, NOT the security boundary. Its output is
 * rendered as text by React Native and escaped again by escapeHtml before it
 * ever reaches an HTML sink, so a tag this regex fails to recognise is a
 * cosmetic bug, not an injection.
 */
export function htmlToPlainText(stored: string): string {
  const withBreaks = stored
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]*>/g, "");
  const decoded = ENTITIES.reduce((acc, [pattern, char]) => acc.replace(pattern, char), stripped);
  return decoded.replace(/\n{3,}/g, "\n\n").trim();
}
