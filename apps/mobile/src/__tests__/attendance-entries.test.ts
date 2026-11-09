import type { AttendanceRosterRow } from "@space/shared";

import { buildAttendanceEntries } from "../lib/attendance-entries";

const roster: AttendanceRosterRow[] = [
  { studentUserId: 9, name: "A", email: "a@jpc.test", groupName: null, status: null, notes: null, lateMinutes: null },
  {
    studentUserId: 10,
    name: "B",
    email: "b@jpc.test",
    groupName: null,
    status: "PRESENT",
    notes: "Doctor's note",
    lateMinutes: null,
  },
];

describe("buildAttendanceEntries", () => {
  it("sends touched rows only, in roster order", () => {
    expect(buildAttendanceEntries(roster, { 9: "PRESENT" }, {})).toEqual([
      { studentUserId: 9, status: "PRESENT", notes: null },
    ]);
  });

  it("carries the stored note through, so re-marking never erases it", () => {
    expect(buildAttendanceEntries(roster, { 10: "ABSENT" }, {})).toEqual([
      { studentUserId: 10, status: "ABSENT", notes: "Doctor's note" },
    ]);
  });

  it("sends an already-LATE row whose minutes alone were edited", () => {
    const late: AttendanceRosterRow = { ...roster[0]!, studentUserId: 11, status: "LATE", lateMinutes: 5 };
    expect(buildAttendanceEntries([...roster, late], {}, { 11: "15" })).toEqual([
      { studentUserId: 11, status: "LATE", notes: null, lateMinutes: 15 },
    ]);
  });

  it("ignores minutes typed on a row that is not LATE", () => {
    // Row 10 is stored PRESENT; leftover minutes text does not make it touched.
    expect(buildAttendanceEntries(roster, {}, { 10: "15" })).toEqual([]);
    // Re-tapped away from LATE: the re-tap wins, minutes are not sent.
    expect(buildAttendanceEntries(roster, { 9: "PRESENT" }, { 9: "15" })).toEqual([
      { studentUserId: 9, status: "PRESENT", notes: null },
    ]);
  });

  it("sends lateMinutes for LATE only, parsed like v1 (blank or junk → null)", () => {
    expect(buildAttendanceEntries(roster, { 9: "LATE", 10: "LATE" }, { 9: "12", 10: "soon" })).toEqual([
      { studentUserId: 9, status: "LATE", notes: null, lateMinutes: 12 },
      { studentUserId: 10, status: "LATE", notes: "Doctor's note", lateMinutes: null },
    ]);
  });
});
