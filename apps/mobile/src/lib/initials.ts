/**
 * v1's rule, used by its More menu, student profile and student season page:
 * the first letters of the first two words of the name, uppercased; `fallback`
 * when there is no usable name. One copy here instead of three.
 */
export function initialsOf(name: string | null, fallback: string): string {
  const trimmed = name?.trim();
  if (!trimmed) return fallback;
  const parts = trimmed.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || fallback;
}
