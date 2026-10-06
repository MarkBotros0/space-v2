import {
  attendanceRosterRowSchema,
  reviewSubmissionResponseSchema,
  saveAttendanceResponseSchema,
} from "../index";

describe("attendanceRosterRowSchema", () => {
  it("parses a row exactly as the backend's AttendanceRosterEntry emits it", () => {
    const row = {
      studentUserId: 9, name: null, email: "s@jpc.test", groupName: "Group A",
      status: "LATE", notes: "Bus", lateMinutes: 12,
    };
    expect(attendanceRosterRowSchema.parse(row)).toEqual(row);
  });

  it("accepts an unmarked row (status null)", () => {
    expect(
      attendanceRosterRowSchema.safeParse({
        studentUserId: 9, name: "A", email: "a@jpc.test", groupName: null,
        status: null, notes: null, lateMinutes: null,
      }).success,
    ).toBe(true);
  });
});

describe("saveAttendanceResponseSchema", () => {
  it("takes the saved COUNT the route returns, not a boolean", () => {
    expect(saveAttendanceResponseSchema.parse({ saved: 2 })).toEqual({ saved: 2 });
    expect(saveAttendanceResponseSchema.safeParse({ saved: true }).success).toBe(false);
  });
});

describe("reviewSubmissionResponseSchema", () => {
  it("parses the review route's payload", () => {
    expect(
      reviewSubmissionResponseSchema.parse({ reviewed: true, returnedForRevision: false }),
    ).toEqual({ reviewed: true, returnedForRevision: false });
  });
});
