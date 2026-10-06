// packages/shared/src/__tests__/season-admin-contracts.test.ts
import {
  checkInStateSchema,
  createSessionRequestSchema,
  groupAssignmentsRequestSchema,
  groupDetailSchema,
  seasonDetailSchema,
  sessionDetailSchema,
  sessionListItemSchema,
  sessionRangeQuerySchema,
  updateSessionRequestSchema,
} from "../index";

const base = { title: "Week one", durationMinutes: 90 };

describe("session start — exactly one of startsAt / (startDay + startTime) (D-16.6)", () => {
  it("accepts org wall-clock fields", () => {
    const parsed = createSessionRequestSchema.parse({
      ...base, seasonId: 1, startDay: "2099-07-03", startTime: "19:30",
    });
    expect(parsed).toMatchObject({ startDay: "2099-07-03", startTime: "19:30", repeatWeeks: 1 });
  });

  it("still accepts Plan 3's instant", () => {
    expect(
      createSessionRequestSchema.safeParse({ ...base, seasonId: 1, startsAt: "2099-03-01T18:00:00.000Z" }).success,
    ).toBe(true);
  });

  it("refuses both, and refuses neither", () => {
    expect(
      createSessionRequestSchema.safeParse({
        ...base, seasonId: 1, startsAt: "2099-03-01T18:00:00.000Z",
        startDay: "2099-03-01", startTime: "20:00",
      }).success,
    ).toBe(false);
    expect(updateSessionRequestSchema.safeParse({ ...base, scope: "one" }).success).toBe(false);
  });

  it("refuses half a wall-clock pair, and malformed halves (Plan 5's schemas)", () => {
    expect(updateSessionRequestSchema.safeParse({ ...base, scope: "one", startDay: "2099-03-01" }).success).toBe(false);
    expect(
      updateSessionRequestSchema.safeParse({ ...base, scope: "one", startDay: "2099-02-31", startTime: "20:00" }).success,
    ).toBe(false);
    expect(
      updateSessionRequestSchema.safeParse({ ...base, scope: "one", startDay: "2099-03-01", startTime: "24:00" }).success,
    ).toBe(false);
  });
});

describe("server-derived fields are required on the wire (C4)", () => {
  const row = {
    id: 1, title: "S", startsAt: "2099-03-01T18:00:00.000Z", dayKey: "2099-03-01",
    durationMinutes: 60, location: null, recurrenceGroupId: null, attendanceMarked: false,
    seasonId: 7, seasonCode: "s7", seasonTitle: "Spring", checkInToken: null,
    checkInOpenAt: null, checkInClosedAt: null,
  };
  it("list rows carry startTime", () => {
    expect(sessionListItemSchema.safeParse(row).success).toBe(false);
    expect(sessionListItemSchema.safeParse({ ...row, startTime: "20:00" }).success).toBe(true);
  });

  it("session detail carries dayKey and startTime", () => {
    const detail = {
      id: 1, title: "S", description: null, startsAt: "2099-03-01T18:00:00.000Z", durationMinutes: 60,
      location: null, youtubeUrl: null, recurrenceGroupId: null, seasonId: 7, seasonCode: "s7",
      seasonTitle: "Spring", checkInOpen: false, myAttendance: null, canMarkAttendance: false,
      canManageCheckIn: false,
    };
    expect(sessionDetailSchema.safeParse(detail).success).toBe(false);
    expect(sessionDetailSchema.safeParse({ ...detail, dayKey: "2099-03-01", startTime: "20:00" }).success).toBe(true);
  });

  it("season detail carries the budget fields and canAdminister (D-16.3)", () => {
    const detail = {
      id: 7, code: "s7", title: "T", program: "TEST", year: 2099, status: "ACTIVE",
      startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
      description: null, sessionCount: 0, studentCount: 0, groups: [],
    };
    expect(seasonDetailSchema.safeParse(detail).success).toBe(false);
    expect(
      seasonDetailSchema.safeParse({ ...detail, absenceBudgetMinutes: 180, absenceWeightMinutes: 90, canAdminister: true }).success,
    ).toBe(true);
  });

  it("group detail carries canManage (D-16.15)", () => {
    const detail = {
      id: 3, name: "A", description: null, seasonId: 7, seasonCode: "s7", seasonTitle: "T",
      leaders: [], students: [],
    };
    expect(groupDetailSchema.safeParse(detail).success).toBe(false);
    expect(groupDetailSchema.safeParse({ ...detail, canManage: false }).success).toBe(true);
  });

  it("check-in state carries the derived expiry time", () => {
    expect(
      checkInStateSchema.safeParse({
        state: "open", isOpen: true, checkInToken: "tok", checkInOpenAt: "2099-03-01T18:00:00.000Z",
        checkInClosedAt: null, expiresAt: "2099-03-01T21:00:00.000Z", expiresAtTime: "23:00",
      }).success,
    ).toBe(true);
  });
});

describe("sessionRangeQuerySchema (D-16.7)", () => {
  it("coerces seasonId from a query string and accepts an empty query", () => {
    expect(sessionRangeQuerySchema.parse({ seasonId: "7" })).toEqual({ seasonId: 7 });
    expect(sessionRangeQuerySchema.parse({})).toEqual({});
  });
  it("refuses a non-numeric seasonId and a non-ISO bound", () => {
    expect(sessionRangeQuerySchema.safeParse({ seasonId: "abc" }).success).toBe(false);
    expect(sessionRangeQuerySchema.safeParse({ from: "yesterday" }).success).toBe(false);
  });
});

describe("groupAssignmentsRequestSchema (D-16.12)", () => {
  it("accepts null as 'unassign'", () => {
    expect(
      groupAssignmentsRequestSchema.safeParse({ assignments: [{ studentUserId: 1, groupId: null }] }).success,
    ).toBe(true);
  });
  it("refuses a student listed twice", () => {
    expect(
      groupAssignmentsRequestSchema.safeParse({
        assignments: [{ studentUserId: 1, groupId: 2 }, { studentUserId: 1, groupId: null }],
      }).success,
    ).toBe(false);
  });
  it("refuses more than 500 rows", () => {
    const assignments = Array.from({ length: 501 }, (_, i) => ({ studentUserId: i + 1, groupId: null }));
    expect(groupAssignmentsRequestSchema.safeParse({ assignments }).success).toBe(false);
  });
});
