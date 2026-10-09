import { dueDistance } from "../lib/due-distance";

// v1 parity 2026-10-09 (07-assignments R48): v1's student list used date-fns
// formatDistanceToNowStrict for "Due <day> · in <distance>".
describe("dueDistance (v1 formatDistanceToNowStrict)", () => {
  const now = new Date("2026-10-10T12:00:00.000Z");
  const at = (ms: number) => new Date(now.getTime() + ms);
  const MIN = 60_000;

  it("is null with no due date, or once the deadline has passed", () => {
    expect(dueDistance(null, now)).toBeNull();
    expect(dueDistance(now, now)).toBeNull();
    expect(dueDistance(at(-MIN), now)).toBeNull();
  });

  it("picks v1's unit and rounds like date-fns", () => {
    expect(dueDistance(at(30_000), now)).toBe("30 seconds");
    expect(dueDistance(at(MIN), now)).toBe("1 minute");
    expect(dueDistance(at(45 * MIN), now)).toBe("45 minutes");
    expect(dueDistance(at(90 * MIN), now)).toBe("2 hours");
    expect(dueDistance(at(23 * 60 * MIN), now)).toBe("23 hours");
    expect(dueDistance(at(36 * 60 * MIN), now)).toBe("2 days");
    expect(dueDistance(at(3 * 1440 * MIN), now)).toBe("3 days");
    expect(dueDistance(at(29 * 1440 * MIN), now)).toBe("29 days");
    expect(dueDistance(at(45 * 1440 * MIN), now)).toBe("2 months");
    expect(dueDistance(at(359 * 1440 * MIN), now)).toBe("1 year");
    expect(dueDistance(at(800 * 1440 * MIN), now)).toBe("2 years");
  });
});
