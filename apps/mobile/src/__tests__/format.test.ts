import { formatDate, formatDueDate, formatSessionTime } from "../lib/format";

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
});
