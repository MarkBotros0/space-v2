// Sessions, report bodies and the endpoint stub shared by the reports-screen*.test.tsx
// suites. The test files mock `../lib/api-client` themselves (jest.mock is hoisted
// per file); `get` here is that mock.
import { apiClient } from "../../lib/api-client";

const get = apiClient.get as jest.Mock;

export const emptyScopes = {
  seasonAdminIds: [] as number[],
  groupLeaderIds: [] as number[],
  activeSeasonId: null as number | null,
  graduationYear: null as number | null,
};
export const sessionFor = (role: "SUPER" | "MENTOR" | "ADMIN" | "LEADER" | "STUDENT") => ({
  user: {
    id: 1,
    name: `Test ${role}`,
    email: `${role}@jpc.test`,
    role,
    avatarPath: null,
    hasPassword: true,
  },
  scopes: emptyScopes,
});

export const row = {
  score: 40,
  attendancePct: 50,
  submissionPct: 30,
  attendanceTotal: 8,
  attendancePresent: 4,
  submissionsExpected: 10,
  submissionsCompleted: 3,
  studentUserId: 21,
  name: "Sara Student",
  email: "sara@jpc.test",
  seasonId: 7,
  seasonTitle: "Spring 2099",
  band: "AT_RISK" as const,
};

export const summary = {
  scope: {
    seasonIds: [7, 8],
    seasons: [
      {
        id: 7,
        code: "spring-2099",
        title: "Spring 2099",
        status: "ACTIVE" as const,
        endDate: "2099-06-30T00:00:00.000Z",
      },
      {
        id: 8,
        code: "autumn-2098",
        title: "Autumn 2098",
        status: "COMPLETED" as const,
        endDate: "2098-12-20T00:00:00.000Z",
      },
    ],
    truncated: false,
    label: "All seasons",
  },
  attendanceTrend: [
    {
      sessionId: 1,
      seasonId: 7,
      seasonTitle: "Spring 2099",
      title: "Opening",
      startsAt: "2099-03-01T18:00:00.000Z",
      dayKey: "2099-03-01",
      presentCount: 8,
      expectedCount: 10,
      pct: 80,
    },
    {
      sessionId: 2,
      seasonId: 7,
      seasonTitle: "Spring 2099",
      title: "Week two",
      startsAt: "2099-03-08T18:00:00.000Z",
      dayKey: "2099-03-08",
      presentCount: 5,
      expectedCount: 10,
      pct: 50,
    },
  ],
  completion: [
    {
      assignmentId: 3,
      seasonId: 7,
      title: "Reflection one",
      completed: 4,
      expected: 8,
      completionRate: 50,
    },
    {
      assignmentId: 4,
      seasonId: 7,
      title: "Nobody expected",
      completed: 0,
      expected: 0,
      completionRate: null,
    },
  ],
  bands: [
    { band: "HIGH" as const, count: 3 },
    { band: "MEDIUM" as const, count: 5 },
    { band: "LOW" as const, count: 2 },
    { band: "AT_RISK" as const, count: 34 },
  ],
  atRisk: [row],
  atRiskTotal: 34,
  cohortSize: 40,
  enrollmentCount: 44,
  generatedAt: "2099-03-10T00:00:00.000Z",
  exportDay: "2099-03-10",
};

export const organisation = {
  totalStudentsNotGraduated: 40,
  totalAlumni: 12,
  activeSeasonCount: 2,
  seasons: [
    {
      seasonId: 7,
      code: "spring-2099",
      program: "GBV",
      year: 2099,
      title: "Spring 2099",
      status: "ACTIVE" as const,
      activeCount: 20,
      completedCount: 3,
      withdrawnCount: 1,
      leaderCount: 2,
    },
  ],
  alumniByYear: [{ year: 2098, count: 12 }],
  generatedAt: "2099-03-10T00:00:00.000Z",
};

/** Answer whichever endpoints a given branch calls. */
export function mockEndpoints({ withOrg = false }: { withOrg?: boolean } = {}) {
  get.mockImplementation((url: string) => {
    if (url.startsWith("/api/v1/reports/organisation")) {
      return Promise.resolve({ data: { data: organisation } });
    }
    if (url.startsWith("/api/v1/reports/engagement/students")) {
      return Promise.resolve({
        data: { data: { scope: summary.scope, rows: [row], nextCursor: null, total: 34 } },
      });
    }
    if (url.startsWith("/api/v1/reports/engagement")) {
      return Promise.resolve({ data: { data: summary } });
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  });
  return withOrg;
}
