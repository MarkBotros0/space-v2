/** "1 student", "3 students": the noun takes an "s" unless the count is exactly one. A non-breaking space keeps the count with its noun when a line wraps. */
export function countOf(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** "1 session", "3 sessions", "2 people": a plain space, for text that may wrap anywhere. `many` defaults to `one` + "s". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "1 person", "3 people". */
export function people(n: number): string {
  return plural(n, "person", "people");
}
