// Pin the zone: a developer's .env may set another ORG_TIMEZONE, and these
// are exact-value tests of Cairo's rules.
jest.mock("../lib/config", () => ({ config: { orgTimezone: "Africa/Cairo" } }));

import {
  addWeeksInOrgTime,
  formatInOrgTime,
  fromOrgWallClock,
  orgDayKey,
  orgWallClock,
  orgWallClockToInstant,
  orgWallTime,
} from "../lib/org-time";

describe("formatInOrgTime", () => {
  it("renders an instant as the organisation's wall clock, not the host's", () => {
    // 2099-03-01T18:00Z is 20:00 in Cairo (UTC+2 in March).
    expect(formatInOrgTime(new Date("2099-03-01T18:00:00.000Z"))).toBe("Mar 1, 2099, 8:00 PM");
  });
});

describe("addWeeksInOrgTime (X13: calendar-week steps in the org zone)", () => {
  it("is plain 7-day steps when no DST boundary is crossed", () => {
    const start = new Date("2099-03-01T18:00:00.000Z");
    expect([0, 1, 2].map((i) => addWeeksInOrgTime(start, i).toISOString())).toEqual([
      "2099-03-01T18:00:00.000Z", "2099-03-08T18:00:00.000Z", "2099-03-15T18:00:00.000Z",
    ]);
  });

  it("keeps 20:00 Cairo across the spring-forward boundary (last Friday of April)", () => {
    // Egypt has observed DST again since 2023: UTC+2 → UTC+3 on 2099-04-24.
    // Fixed 7-day instants would drift to 21:00; the series must stay at 20:00.
    const start = new Date("2099-04-17T18:00:00.000Z");
    expect([0, 1, 2].map((i) => addWeeksInOrgTime(start, i).toISOString())).toEqual([
      "2099-04-17T18:00:00.000Z", "2099-04-24T17:00:00.000Z", "2099-05-01T17:00:00.000Z",
    ]);
  });

  it("keeps 21:00 Cairo across the fall-back boundary (last Thursday of October)", () => {
    const start = new Date("2099-10-16T18:00:00.000Z"); // 21:00 at UTC+3
    expect([0, 1, 2].map((i) => addWeeksInOrgTime(start, i).toISOString())).toEqual([
      "2099-10-16T18:00:00.000Z", "2099-10-23T18:00:00.000Z", "2099-10-30T19:00:00.000Z",
    ]);
  });
});

describe("orgWallClock / fromOrgWallClock", () => {
  it("round-trips an instant", () => {
    const at = new Date("2099-07-01T09:30:15.250Z");
    expect(fromOrgWallClock(orgWallClock(at)).toISOString()).toBe(at.toISOString());
  });
});

describe("orgDayKey", () => {
  // config.orgTimezone defaults to Africa/Cairo (Plan 3): UTC+2 in March.
  // If the configured zone changes, these expectations change with it.
  it("keys an evening session to its own org-calendar day", () => {
    expect(orgDayKey(new Date("2099-03-01T18:00:00.000Z"))).toBe("2099-03-01");
  });

  it("keys a late-UTC instant to the NEXT day when the org clock has passed midnight", () => {
    // 23:30Z is 01:30 on the 2nd in Cairo. A device in UTC would group this
    // session under the 1st — the bug ruling X13 exists to prevent.
    expect(orgDayKey(new Date("2099-03-01T23:30:00.000Z"))).toBe("2099-03-02");
  });

  it("zero-pads month and day", () => {
    expect(orgDayKey(new Date("2099-01-05T10:00:00.000Z"))).toBe("2099-01-05");
  });
});

describe("orgWallTime / orgWallClockToInstant (Plan 5 — due dates, C2)", () => {
  it("reads the org wall-clock time of an instant on both sides of DST", () => {
    expect(orgWallTime(new Date("2099-03-10T21:59:00.000Z"))).toBe("23:59"); // UTC+2
    expect(orgWallTime(new Date("2099-05-01T20:59:00.000Z"))).toBe("23:59"); // UTC+3
  });

  it("composes the instant an org day and time name — the offset follows DST", () => {
    expect(orgWallClockToInstant("2099-03-10", "23:59").toISOString()).toBe(
      "2099-03-10T21:59:00.000Z",
    );
    expect(orgWallClockToInstant("2099-05-01", "23:59").toISOString()).toBe(
      "2099-05-01T20:59:00.000Z",
    );
    expect(orgWallClockToInstant("2099-01-15", null).toISOString()).toBe("2099-01-14T22:00:00.000Z");
  });

  it("round-trips through orgDayKey and orgWallTime", () => {
    const at = orgWallClockToInstant("2099-10-29", "09:05"); // the day DST ends
    expect(orgDayKey(at)).toBe("2099-10-29");
    expect(orgWallTime(at)).toBe("09:05");
  });

  it("refuses a malformed day or time instead of composing garbage", () => {
    expect(() => orgWallClockToInstant("2099-3-10", "23:59")).toThrow(RangeError);
    expect(() => orgWallClockToInstant("2099-03-10", "24:00")).toThrow(RangeError);
  });
});
