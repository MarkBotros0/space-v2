import type { SessionListItem } from "@space/shared";

import { unmarkedSessions } from "../lib/staff-today";

const NOW = new Date("2026-11-05T12:00:00.000Z");

function session(id: number, startsAt: string, durationMinutes: number, marked = false): SessionListItem {
  return {
    id, title: `S${id}`, startsAt, dayKey: startsAt.slice(0, 10), startTime: "10:00",
    durationMinutes, location: null, recurrenceGroupId: null, attendanceMarked: marked,
    seasonId: 1, seasonCode: "s1", seasonTitle: "Season 1",
    checkInToken: null, checkInOpenAt: null, checkInClosedAt: null,
  };
}

describe("unmarkedSessions", () => {
  it("counts a session ending exactly at now", () => {
    const s = session(1, "2026-11-05T11:00:00.000Z", 60);
    expect(unmarkedSessions([s], NOW)).toEqual([s]);
  });
  it("excludes a marked session and a future one", () => {
    const marked = session(1, "2026-11-04T10:00:00.000Z", 60, true);
    const future = session(2, "2026-11-06T10:00:00.000Z", 60);
    expect(unmarkedSessions([marked, future], NOW)).toEqual([]);
  });
  it("excludes one still in progress and returns newest first", () => {
    const old = session(1, "2026-11-01T10:00:00.000Z", 60);
    const recent = session(2, "2026-11-04T10:00:00.000Z", 60);
    const running = session(3, "2026-11-05T11:30:00.000Z", 60);
    expect(unmarkedSessions([old, running, recent], NOW).map((s) => s.id)).toEqual([2, 1]);
  });
});

describe("the org's today, when the device disagrees", () => {
  // The device says 2026-11-05 12:00Z. The sessions are placed by their dayKey.
  const past = session(1, "2026-11-09T10:00:00.000Z", 60); // device: future
  const future = session(2, "2026-11-01T10:00:00.000Z", 60); // device: over
  const sameDay = session(3, "2026-11-05T11:00:00.000Z", 60); // over by the instants
  const sameDayRunning = session(4, "2026-11-05T11:30:00.000Z", 60);

  it("unmarked: a day before the org's today is over whatever the device says", () => {
    expect(unmarkedSessions([past], NOW, "2026-11-10")).toEqual([past]);
  });
  it("unmarked: a day after the org's today never counts", () => {
    expect(unmarkedSessions([future], NOW, "2026-10-30")).toEqual([]);
  });
  it("unmarked: the org's own day falls back to the instants", () => {
    expect(unmarkedSessions([sameDay, sameDayRunning], NOW, "2026-11-05")).toEqual([sameDay]);
  });
  it("without today the device decides, as before", () => {
    expect(unmarkedSessions([past, future], NOW).map((s) => s.id)).toEqual([2]);
  });
});
