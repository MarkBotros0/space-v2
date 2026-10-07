import {
  firstName,
  formatEventWhen,
  formatDate,
  formatDayKey,
  formatDueDate,
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

  it("renders a due date as a calendar day", () => {
    expect(formatDueDate("2026-04-01T00:00:00.000Z")).toContain("2026");
  });

  it("returns a placeholder for a null timestamp rather than throwing", () => {
    // dueAt, submittedAt, reviewedAt and checkedInAt are all nullable.
    expect(formatDate(null)).toBe("—");
  });

  it("returns a placeholder for a null session time rather than throwing", () => {
    expect(formatSessionTime(null)).toBe("—");
  });

  it("returns a placeholder for a null due date rather than throwing", () => {
    expect(formatDueDate(null)).toBe("—");
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
    expect(formatWallTime("23:59")).toBe("11:59 PM");
    expect(formatWallTime("00:05")).toBe("12:05 AM");
    expect(formatWallTime("12:00")).toBe("12:00 PM");
    expect(formatWallTime(null)).toBe("—");
    expect(formatWallTime("7pm")).toBe("—");
  });

  it("labels a deadline from the server's org day and time", () => {
    expect(formatOrgDue("2099-04-01", "23:59")).toBe("Apr 1, 2099, 11:59 PM");
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
    expect(formatEventWhen({ dayKey: "2099-03-05", endDayKey: null, time: "18:30" })).toBe("Mar 5, 2099 · 6:30 PM");
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
