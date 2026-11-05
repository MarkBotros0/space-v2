/** Joins the parts of a meta line with " · ", dropping empty, blank and falsy parts so no separator dangles. */
export function joinMeta(parts: (string | number | null | undefined | false)[]): string {
  return parts
    .filter((p): p is string | number => p !== null && p !== undefined && p !== false)
    .map((p) => String(p).trim())
    .filter((p) => p !== "")
    .join(" · ");
}
