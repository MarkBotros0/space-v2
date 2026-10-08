import {
  addDays, bucketByDay, dayCue, fetchWindow, monthGridKeys, rangeLabel, seasonSlots,
  sessionBadge, sessionTone, startOfWeek, stepAnchor, weekKeys,
} from "../lib/calendar-grid";

describe("calendar-grid", () => {
  it("starts weeks on Monday", () => {
    expect(startOfWeek("2099-03-01")).toBe("2099-02-23"); // a Sunday belongs to the week before
    expect(weekKeys("2099-03-04")).toEqual([
      "2099-03-02", "2099-03-03", "2099-03-04", "2099-03-05", "2099-03-06", "2099-03-07", "2099-03-08",
    ]);
  });

  it("builds a month grid of whole Mon-Sun weeks around the month", () => {
    const keys = monthGridKeys("2099-03-15");
    expect(keys[0]).toBe("2099-02-23");
    expect(keys[keys.length - 1]).toBe("2099-04-05");
    expect(keys.length % 7).toBe(0);
    expect(monthGridKeys("2099-02-10")).toHaveLength(28 + 7); // Feb 2099 starts on a Sunday
  });

  it("steps weeks by 7 days and months to the first of the neighbour", () => {
    expect(stepAnchor("week", "2099-03-31", 1)).toBe("2099-04-07");
    expect(stepAnchor("month", "2099-01-31", 1)).toBe("2099-02-01");
    expect(stepAnchor("month", "2099-01-15", -1)).toBe("2098-12-01");
    expect(addDays("2099-12-31", 1)).toBe("2100-01-01");
  });

  it("labels the range", () => {
    expect(rangeLabel("month", "2099-03-15")).toBe("March 2099");
    expect(rangeLabel("week", "2099-03-04")).toBe("Mar 2 – 8");
    expect(rangeLabel("week", "2099-03-01")).toBe("Feb 23 – Mar 1");
  });

  it("pads the fetch window a day each side and stays under the 120-day cap", () => {
    const keys = monthGridKeys("2099-03-15");
    const { from, to } = fetchWindow(keys);
    expect(from).toBe("2099-02-22T00:00:00.000Z");
    expect(to).toBe("2099-04-07T00:00:00.000Z");
    expect((Date.parse(to) - Date.parse(from)) / 86_400_000).toBeLessThan(120);
  });

  it("classifies a day and words the cue", () => {
    expect(sessionTone("2099-03-01", "2099-03-01")).toBe("today");
    expect(sessionTone("2099-02-28", "2099-03-01")).toBe("past");
    expect(sessionTone("2099-03-02", "2099-03-01")).toBe("upcoming");
    expect(dayCue("2099-03-01", "2099-03-01")).toBe("Today");
    expect(dayCue("2099-03-02", "2099-03-01")).toBe("in 1 day");
    expect(dayCue("2099-03-05", "2099-03-01")).toBe("in 4 days");
    expect(dayCue("2099-02-28", "2099-03-01")).toBeNull();
  });

  it("badges as v1's session list did, attendance only for staff", () => {
    const past = { dayKey: "2099-02-01", attendanceMarked: true };
    expect(sessionBadge({ dayKey: "2099-03-01", attendanceMarked: false }, "2099-03-01", true)).toBe("Today");
    expect(sessionBadge({ dayKey: "2099-03-09", attendanceMarked: false }, "2099-03-01", false)).toBe("Upcoming");
    expect(sessionBadge(past, "2099-03-01", true)).toBe("Attendance marked");
    expect(sessionBadge({ ...past, attendanceMarked: false }, "2099-03-01", true)).toBe("Attendance pending");
    expect(sessionBadge(past, "2099-03-01", false)).toBeNull();
  });

  it("assigns palette slots by first appearance, cycling after five", () => {
    const codes = ["A", "B", "A", "C", "D", "E", "F"].map((seasonCode) => ({ seasonCode }));
    expect(seasonSlots(codes)).toEqual({ A: 0, B: 1, C: 2, D: 3, E: 4, F: 0 });
    // A later window keeps the colours already handed out.
    expect(seasonSlots([{ seasonCode: "Z" }, { seasonCode: "B" }], { B: 1, A: 0 })).toEqual({ A: 0, B: 1, Z: 2 });
  });

  it("buckets sessions and events by the server's dayKey", () => {
    const s = { id: 1, dayKey: "2099-03-02" } as never;
    const e = { id: 2, dayKey: "2099-03-02" } as never;
    const out = bucketByDay([s], [e]);
    expect(out.get("2099-03-02")).toEqual({ sessions: [s], events: [e] });
  });
});
