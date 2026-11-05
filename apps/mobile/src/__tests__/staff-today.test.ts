import type { SessionListItem } from "@space/shared";

import {
  hasNothingToDo,
  liveSessions,
  nextSession,
  unmarkedSessions,
  type NeedsAction,
} from "../lib/staff-today";

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
  it("counts a session ending exactly at now, and it is not live", () => {
    const s = session(1, "2026-11-05T11:00:00.000Z", 60);
    expect(unmarkedSessions([s], NOW)).toEqual([s]);
    expect(liveSessions([s], NOW)).toEqual([]);
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

describe("liveSessions", () => {
  it("returns every overlapping live session, including one starting exactly now", () => {
    const a = session(1, "2026-11-05T11:30:00.000Z", 60);
    const b = session(2, "2026-11-05T12:00:00.000Z", 30);
    const done = session(3, "2026-11-05T10:00:00.000Z", 60);
    expect(liveSessions([b, done, a], NOW).map((s) => s.id)).toEqual([1, 2]);
  });
});

describe("nextSession", () => {
  it("is the earliest session strictly after now, else null", () => {
    const a = session(1, "2026-11-07T10:00:00.000Z", 60);
    const b = session(2, "2026-11-06T10:00:00.000Z", 60);
    const atNow = session(3, "2026-11-05T12:00:00.000Z", 60);
    expect(nextSession([a, b, atNow], NOW)?.id).toBe(2);
    expect(nextSession([atNow], NOW)).toBeNull();
    expect(nextSession([], NOW)).toBeNull();
  });
});

describe("hasNothingToDo", () => {
  const zero: NeedsAction = { pendingReview: 0, unmarkedSessions: 0, atRisk: 0, pendingInvites: 0 };
  it("is true when every applicable count is 0, ignoring an inapplicable one", () => {
    expect(hasNothingToDo({ ...zero, pendingInvites: undefined })).toBe(true);
    expect(hasNothingToDo(zero)).toBe(true);
  });
  it("is false on any null or any non-zero count", () => {
    expect(hasNothingToDo({ ...zero, atRisk: null })).toBe(false);
    expect(hasNothingToDo({ ...zero, pendingInvites: null })).toBe(false);
    expect(hasNothingToDo({ ...zero, pendingReview: 1 })).toBe(false);
  });
});
