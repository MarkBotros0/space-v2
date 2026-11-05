import { formatMinutes } from "../lib/format";
import { attendanceLine } from "../screens/session-detail/attendance-line";

describe("formatMinutes (sweep R5)", () => {
  it("joins number and unit with a non-breaking space", () => {
    expect(formatMinutes(90)).toBe("90 min");
    expect(formatMinutes(90)).not.toContain(" ");
  });

  it("is used by the late line", () => {
    const line = attendanceLine({ status: "LATE", lateMinutes: 15 } as Parameters<typeof attendanceLine>[0]);
    expect(line).toBe("Your attendance: Late (15 min)");
  });
});
