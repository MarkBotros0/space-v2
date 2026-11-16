/**
 * Meta lines hold their facts together with no-break spaces (`joinMeta`, `formatTimeAgo`), so a
 * line wraps only between facts. Tests compare the words: this turns every no-break space back
 * into a plain one, in a string or anywhere inside an object or array.
 */
export function plain<T>(value: T): T {
  if (typeof value === "string") return value.replace(/ /g, " ") as T;
  if (Array.isArray(value)) return value.map(plain) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)])) as T;
  }
  return value;
}
