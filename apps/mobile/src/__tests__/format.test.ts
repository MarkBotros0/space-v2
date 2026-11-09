import {
  NBSP,
  unbreakable,
  formatShortDateTime,
  addMinutesToWallTime,
  formatDistanceOnly,
  formatEventWhenShort,
  formatLongDay,
  formatLongDayYear,
  formatShortDay,
  formatStampAgo,
  notificationTypeLabel,
  formatWeekdayDayYear,
  firstName,
  formatEventWhen,
  formatDate,
  formatDayKey,
  formatOrgDue,
  formatSessionTime,
  formatWallTime,
} from "../lib/format";

describe("format", () => {
  it("formats an ISO string from the API, not a Date", () => {
    // Every timestamp crossing the wire is a string; a formatter that only
    // accepts Date would force every screen to parse first.
    expect(formatSessionTime("2026-03-01T18:00:00.000Z")).toEqual(expect.any(String));
  });

  it("returns a placeholder for a null timestamp rather than throwing", () => {
    // dueAt, submittedAt, reviewedAt and checkedInAt are all nullable.
    expect(formatDate(null)).toBe("—");
  });

  it("returns a placeholder for a null session time rather than throwing", () => {
    expect(formatSessionTime(null)).toBe("—");
  });

  // `formatIso` documents this as placeholder behaviour for a string that
  // fails to parse, but nothing previously exercised the branch — it could
  // be deleted without a test failing.
  it("returns a placeholder for an empty string rather than throwing", () => {
    expect(formatDate("")).toBe("—");
  });

  it("returns a placeholder for a string that isn't a date at all", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });

  it("returns a placeholder for a string shaped like a date but with out-of-range fields", () => {
    expect(formatDate("2026-13-45")).toBe("—");
  });
});

describe("formatDayKey", () => {
  it("renders the server's org-calendar day without shifting it into the device zone", () => {
    // The key is already the org's day (ruling X13); formatting must not move it.
    expect(formatDayKey("2099-03-01")).toBe("Mar 1, 2099");
    expect(formatDayKey("2099-12-31")).toBe("Dec 31, 2099");
  });
  it("returns the placeholder for null or a malformed key", () => {
    expect(formatDayKey(null)).toBe("—");
    expect(formatDayKey("not-a-day")).toBe("—");
  });
});

describe("formatWallTime / formatOrgDue (server org-clock values, no zone conversion — X13)", () => {
  it("renders an HH:mm wall-clock time as 12-hour text", () => {
    expect(formatWallTime("23:59")).toBe("11:59\u00A0PM");
    expect(formatWallTime("00:05")).toBe("12:05\u00A0AM");
    expect(formatWallTime("12:00")).toBe("12:00\u00A0PM");
    expect(formatWallTime(null)).toBe("—");
    expect(formatWallTime("7pm")).toBe("—");
  });

  it("labels a deadline from the server's org day and time", () => {
    expect(formatOrgDue("2099-04-01", "23:59")).toBe("Apr 1, 2099, 11:59\u00A0PM");
    expect(formatOrgDue("2099-04-01", null)).toBe("Apr 1, 2099");
    expect(formatOrgDue(null, null)).toBe("No due date");
  });
});

describe("firstName (spec 19 D21 — one formatter for STUDENT and ALUMNI)", () => {
  it("takes the first whitespace-separated token of the trimmed name", () => {
    expect(firstName("  Sara   Mansour ")).toBe("Sara");
  });
  it("falls back to 'there' on null AND on empty (v1 rendered 'Welcome back, ')", () => {
    expect(firstName(null)).toBe("there");
    expect(firstName("   ")).toBe("there");
  });
});

describe("formatEventWhen (spec 19 R11, X13 — server day keys and wall time only)", () => {
  it("shows the day and the org wall time", () => {
    expect(formatEventWhen({ dayKey: "2099-03-05", endDayKey: null, time: "18:30" })).toBe(
      "Mar 5, 2099 · 6:30\u00A0PM",
    );
  });
  it("omits the time for an all-day event and collapses a same-day range", () => {
    expect(formatEventWhen({ dayKey: "2099-03-05", endDayKey: "2099-03-05", time: null })).toBe("Mar 5, 2099");
  });
  it("shows a multi-day range", () => {
    expect(formatEventWhen({ dayKey: "2099-03-05", endDayKey: "2099-03-07", time: null })).toBe(
      "Mar 5, 2099 – Mar 7, 2099",
    );
  });
});

describe("batch-2 formatters", () => {
  it("formats org day keys without touching the device zone", () => {
    expect(formatShortDay("2026-03-13")).toBe("Mar 13");
    expect(formatLongDay("2026-03-08")).toBe("Sunday, March 8");
    expect(formatLongDayYear("2026-03-08")).toBe("Sunday, March 8, 2026");
    expect(formatWeekdayDayYear("2026-03-08")).toBe("Sun, Mar 8, 2026");
    expect(formatShortDay(null)).toBe("—");
    expect(formatLongDay("nope")).toBe("—");
  });

  it("adds to wall-clock times as text", () => {
    expect(addMinutesToWallTime("20:00", 90)).toBe("21:30");
    expect(addMinutesToWallTime("23:30", 45)).toBe("00:15");
    expect(addMinutesToWallTime(null, 30)).toBeNull();
  });

  it("formats v1's short event label", () => {
    expect(formatEventWhenShort({ dayKey: "2099-03-05", endDayKey: null, time: "18:30" })).toBe("Mar 5 · 6:30\u00A0PM");
    expect(formatEventWhenShort({ dayKey: "2099-03-05", endDayKey: "2099-03-07", time: null })).toBe("Mar 5 – Mar 7");
    expect(formatEventWhenShort({ dayKey: "2099-03-05", endDayKey: "2099-03-05", time: null })).toBe("Mar 5");
  });

  it("formats distances and stamps", () => {
    const inThreeDays = new Date(Date.now() + 3 * 86_400_000 + 60_000).toISOString();
    expect(formatDistanceOnly(inThreeDays)).toBe("3 days");
    expect(formatDistanceOnly(null)).toBe("—");
    expect(formatStampAgo(new Date(Date.now() - 2 * 3_600_000).toISOString())).toMatch(
      /^\w{3}\u00A0\d{1,2},\u00A0\d{4} · \d{1,2}:\d{2}\u00A0(AM|PM) · 2 hours ago$/,
    );
  });
});

describe("formatShortDateTime (v1 submissions 'MMM d, h:mm a', device zone)", () => {
  it("formats an instant without the year", () => {
    expect(formatShortDateTime(new Date(2026, 6, 1, 18, 13).toISOString())).toBe("Jul 1, 6:13\u00A0PM");
    expect(formatShortDateTime(null)).toBe("—");
  });
});

describe("unbreakable", () => {
  it("turns every space into U+00A0 so a unit cannot wrap", () => {
    expect(unbreakable("Max 100 pts")).toBe(["Max", "100", "pts"].join(NBSP));
    expect(unbreakable("9:00 PM")).not.toContain(" ");
  });
});

describe("times never break across lines", () => {
  it("joins every clock and meridiem with U+00A0, no ordinary or narrow space", () => {
    const outs = [
      formatWallTime("21:05"),
      formatSessionTime("2099-03-01T21:05:00"),
      formatShortDateTime("2099-03-01T09:05:00"),
      formatStampAgo("2099-03-01T09:05:00"),
    ];
    for (const out of outs) expect(out).toMatch(/\d:\d{2}\u00A0(AM|PM)/);
  });
});

describe("notificationTypeLabel", () => {
  it("reads as words, not the enum", () => {
    expect(notificationTypeLabel("QUIZ_GRADED")).toBe("Quiz graded");
  });
});
