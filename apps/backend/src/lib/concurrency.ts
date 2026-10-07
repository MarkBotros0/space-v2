/**
 * Run `fn` over `items` with at most `limit` calls in flight, returning
 * results in input order. Exists for the bulk invite sender (Plan 10
 * Decision 12): N SMTP round trips one after another is what made v1's bulk
 * action unsurvivable inside a request (spec 11 R18); all at once would trip
 * Gmail's connection limits. A small pool is the middle.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("mapWithConcurrency: limit must be a positive integer");
  }
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index] as T, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
