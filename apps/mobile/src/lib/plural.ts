/** "1 student", "3 students": the noun takes an "s" unless the count is exactly one. A non-breaking space keeps the count with its noun when a line wraps. */
export function countOf(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
