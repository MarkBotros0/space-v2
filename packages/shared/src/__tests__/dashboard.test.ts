// packages/shared/src/__tests__/dashboard.test.ts
import {
  DASHBOARD_AT_RISK_PREVIEW,
  DUE_SOON_LIMIT,
  RECENT_ACTIVITY_LIMIT,
  UPCOMING_EVENTS_LIMIT,
  dashboardSchema,
  leaderSessionCheckInSchema,
  meanAttendancePct,
  staffSeasonDashboardSchema,
  studentDashboardSchema,
} from "../index";

const score = (attendancePct: number, attendanceTotal: number) => ({ attendancePct, attendanceTotal });

describe("meanAttendancePct (spec 19 D5)", () => {
  it("averages only students who have had a session, rounded", () => {
    expect(meanAttendancePct([score(67, 3), score(33, 3), score(0, 3)])).toBe(33);
    // The 0 % row with attendanceTotal 0 is "no data", not "never came".
    expect(meanAttendancePct([score(80, 5), score(0, 0)])).toBe(80);
  });

  it("is null — rendered '—' — when nobody has had a session yet (v1 showed a red 0 %, R29)", () => {
    expect(meanAttendancePct([score(0, 0), score(0, 0)])).toBeNull();
    expect(meanAttendancePct([])).toBeNull();
  });
});

describe("limits (spec 19 §8)", () => {
  it("keeps v1's caps", () => {
    expect([DASHBOARD_AT_RISK_PREVIEW, DUE_SOON_LIMIT, UPCOMING_EVENTS_LIMIT, RECENT_ACTIVITY_LIMIT]).toEqual([10, 3, 4, 8]);
  });
});

const notEnrolled = { variant: "STUDENT", todayOrgDay: "2099-03-01", season: null, progress: null, nextSession: null, assignments: null };

describe("studentDashboardSchema (ruling C8 #2)", () => {
  it("accepts the not-enrolled shape (R63)", () => {
    expect(studentDashboardSchema.parse(notEnrolled)).toEqual(notEnrolled);
  });

  it("requires todayOrgDay, an org day key, also when not enrolled", () => {
    const { todayOrgDay: _day, ...without } = notEnrolled;
    expect(studentDashboardSchema.safeParse(without).success).toBe(false);
    expect(studentDashboardSchema.safeParse({ ...notEnrolled, todayOrgDay: "tomorrow" }).success).toBe(false);
  });

  it("refuses any extra field, so a leaked cohort figure fails at the client", () => {
    expect(studentDashboardSchema.safeParse({ ...notEnrolled, cohort: { studentCount: 3 } }).success).toBe(false);
  });
});

describe("dashboardSchema", () => {
  it("discriminates on variant", () => {
    expect(dashboardSchema.parse({ variant: "MENTOR", recentActivity: [] }).variant).toBe("MENTOR");
    expect(dashboardSchema.safeParse({ variant: "ALUMNI" }).success).toBe(false);
  });

  it("caps the mentor feed at RECENT_ACTIVITY_LIMIT", () => {
    const item = {
      key: "att:1",
      kind: "attendance",
      at: "2099-05-01T09:00:00.000Z",
      studentUserId: 1,
      studentName: "Sara",
      subjectTitle: "Week 1",
      attendanceStatus: "PRESENT",
      submissionPublicId: null,
    };
    const nine = Array.from({ length: 9 }, (_, i) => ({ ...item, key: `att:${i}` }));
    expect(dashboardSchema.safeParse({ variant: "MENTOR", recentActivity: nine }).success).toBe(false);
  });
});

describe("leaderSession on the staff dashboard", () => {
  const leaderSession = {
    sessionId: 7,
    total: 4,
    present: 1,
    late: 1,
    absent: 1,
    notCheckedIn: [{ id: 3, name: "Sara" }],
  };
  const staff = {
    variant: "SEASON_STAFF",
    todayOrgDay: "2099-03-01",
    scope: "groups",
    season: { id: 1, code: "S1", title: "Season", status: "ACTIVE" },
    groups: [{ id: 2, name: "A" }],
    progress: { sessionsHeld: 0, sessionsTotal: 0, pct: null },
    nextSession: null,
    cohort: { studentCount: 0, meanAttendancePct: null, atRiskTotal: 0, atRisk: [] },
    submissions: { pendingReview: 0, reviewed: 0 },
    quizzes: { total: 0, pending: 0, fullyGraded: 0, drafts: 0 },
  };

  it("parses a dashboard without the field, with null, and with a value", () => {
    expect(staffSeasonDashboardSchema.safeParse(staff).success).toBe(true);
    expect(staffSeasonDashboardSchema.safeParse({ ...staff, leaderSession: null }).success).toBe(true);
    expect(staffSeasonDashboardSchema.parse({ ...staff, leaderSession }).leaderSession).toEqual(leaderSession);
  });

  it("requires todayOrgDay, an org day key, as the student arm does", () => {
    const { todayOrgDay: _day, ...without } = staff;
    expect(staffSeasonDashboardSchema.safeParse(without).success).toBe(false);
    expect(staffSeasonDashboardSchema.safeParse({ ...staff, todayOrgDay: "tomorrow" }).success).toBe(false);
  });

  it("is strict: an extra field on a not-checked-in student fails", () => {
    const leaked = { ...leaderSession, notCheckedIn: [{ id: 3, name: "Sara", email: "x" }] };
    expect(leaderSessionCheckInSchema.safeParse(leaked).success).toBe(false);
    expect(leaderSessionCheckInSchema.safeParse({ ...leaderSession, extra: 1 }).success).toBe(false);
  });
});
