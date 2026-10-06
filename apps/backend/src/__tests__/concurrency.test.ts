import { mapWithConcurrency } from "../lib/concurrency";

describe("mapWithConcurrency", () => {
  it("returns results in input order regardless of completion order", async () => {
    const delays = [30, 5, 20, 1];
    const out = await mapWithConcurrency(delays, 2, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3]);
  });

  it("never has more than `limit` calls in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight -= 1;
    });
    expect(peak).toBe(3);
  });

  it("handles an empty list and refuses a non-positive limit", async () => {
    await expect(mapWithConcurrency([], 5, async () => 1)).resolves.toEqual([]);
    await expect(mapWithConcurrency([1], 0, async () => 1)).rejects.toThrow(RangeError);
  });
});
