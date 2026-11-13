// Fixtures shared by the dashboard-*.test.tsx suites. The test files mock
// `../lib/api-client` themselves (jest.mock is hoisted per file); `get` here is
// that mock.
import { apiClient } from "../../lib/api-client";

export const get = apiClient.get as jest.Mock;
export const UNREAD = "/api/v1/notifications/unread-count";
export const EVENTS = "/api/v1/events?upcoming=true&limit=4";

/** Answer exactly these URLs; anything else rejects, so a stray request shows up as a failure. */
export function serve(routes: Record<string, unknown>) {
  get.mockImplementation((url: string) =>
    url in routes ? Promise.resolve({ data: { data: routes[url] } }) : Promise.reject(new Error(`not served: ${url}`)),
  );
}
export const requested = () => get.mock.calls.map(([url]) => url as string);

export const event = {
  id: 3,
  title: "Open day",
  date: "2099-03-05T16:30:00.000Z",
  endDate: null,
  dayKey: "2099-03-05",
  endDayKey: null,
  isPast: false,
  time: "18:30",
  allDay: false,
  url: null,
  visibility: "ALL",
  seasonId: null,
  seasonCode: null,
};
export const events = { events: [event], total: 9 };

export const liveSession = {
  id: 11,
  title: "Week 6",
  startsAt: "2099-03-01T16:00:00.000Z",
  dayKey: "2099-03-01",
  time: "18:00",
  durationMinutes: 90,
  location: "Hall",
  youtubeUrl: "https://youtu.be/live",
  isInProgress: true,
};

export const studentDashboard = {
  variant: "STUDENT",
  todayOrgDay: "2099-03-01",
  season: { id: 7, code: "spring-2099", title: "Spring 2099", status: "ACTIVE" },
  progress: { sessionsHeld: 3, sessionsTotal: 4, pct: 75 },
  nextSession: liveSession,
  assignments: {
    outstandingCount: 2,
    overdueCount: 1,
    lateSubmittedCount: 1,
    dueSoon: [
      {
        id: 41,
        title: "Old essay",
        dueAt: "2020-01-05T10:00:00.000Z",
        dueOrgDay: "2020-01-05",
        isOverdue: true,
        status: "PENDING",
        reviewedAt: null,
        submittedAt: null,
        partsTotal: 1,
        partsDone: 0,
        returned: false,
        hasEssay: true,
        staffMarked: false,
        createdAt: "2099-01-01T00:00:00.000Z",
      },
      {
        id: 42,
        title: "New essay",
        dueAt: "2099-06-01T10:00:00.000Z",
        dueOrgDay: "2099-06-01",
        isOverdue: false,
        status: "DRAFT",
        reviewedAt: null,
        submittedAt: null,
        partsTotal: 1,
        partsDone: 0,
        returned: false,
        hasEssay: true,
        staffMarked: false,
        createdAt: "2099-01-01T00:00:00.000Z",
      },
    ],
    open: [
      {
        id: 41,
        title: "Old essay",
        dueAt: "2020-01-05T10:00:00.000Z",
        dueOrgDay: "2020-01-05",
        isOverdue: true,
        status: "PENDING",
        reviewedAt: null,
        submittedAt: null,
        partsTotal: 1,
        partsDone: 0,
        returned: false,
        hasEssay: true,
        staffMarked: false,
        createdAt: "2099-01-01T00:00:00.000Z",
      },
      {
        id: 42,
        title: "New essay",
        dueAt: "2099-06-01T10:00:00.000Z",
        dueOrgDay: "2099-06-01",
        isOverdue: false,
        status: "DRAFT",
        reviewedAt: null,
        submittedAt: null,
        partsTotal: 1,
        partsDone: 0,
        returned: false,
        hasEssay: true,
        staffMarked: false,
        createdAt: "2099-01-01T00:00:00.000Z",
      },
      {
        id: 43,
        title: "Redo essay",
        dueAt: "2099-07-01T10:00:00.000Z",
        dueOrgDay: "2099-07-01",
        isOverdue: false,
        status: "RETURNED",
        reviewedAt: null,
        submittedAt: null,
        partsTotal: 1,
        partsDone: 0,
        returned: true,
        hasEssay: true,
        staffMarked: false,
        createdAt: "2099-01-01T00:00:00.000Z",
      },
    ],
  },
};

/** The student's quiz list on Today (season 7, the fixture's). */
export const STUDENT_QUIZZES = "/api/v1/quizzes?seasonId=7";
export const NEXT_SESSION_DETAIL = `/api/v1/sessions/${liveSession.id}`;

export const quizResult = {
  quizId: 31,
  title: "Week 6 quiz",
  kind: "ONLINE",
  maxScore: 10,
  score: null,
  notes: null,
  gradedAt: null,
  sessionTitle: null,
  sessionDate: null,
  attemptStatus: null,
  answersReleased: false,
  createdAt: "2099-01-01T00:00:00.000Z",
};
export const quizPage = { items: [quizResult], nextCursor: null };

/** `useSessionDetail` for `liveSession`, check-in open. */
export const sessionDetail = {
  id: liveSession.id,
  title: liveSession.title,
  description: null,
  startsAt: liveSession.startsAt,
  dayKey: liveSession.dayKey,
  startTime: liveSession.time,
  durationMinutes: liveSession.durationMinutes,
  location: liveSession.location,
  youtubeUrl: liveSession.youtubeUrl,
  recurrenceGroupId: null,
  seasonId: 7,
  seasonCode: "spring-2099",
  seasonTitle: "Spring 2099",
  checkInOpen: true,
  myAttendance: null,
  canMarkAttendance: false,
  canManageCheckIn: false,
};

export const myAttendance = {
  season: { id: 7, title: "Spring 2099", absenceBudgetMinutes: 180, absenceWeightMinutes: 90 },
  budget: {
    minutesUsed: 105,
    budgetMinutes: 180,
    budgetPct: 58,
    remainingPct: 42,
    absentCount: 1,
    lateCount: 1,
  },
  streak: 2,
  sessions: [],
};

export const engagementRow = (studentUserId: number, studentName: string, score: number) => ({
  score,
  attendancePct: 33,
  submissionPct: 33,
  attendanceTotal: 3,
  attendancePresent: 1,
  submissionsExpected: 3,
  submissionsCompleted: 1,
  studentUserId,
  seasonId: 7,
  seasonTitle: "Spring 2099",
  atRisk: true,
  studentName,
  groupId: 5,
  groupName: "Group A",
});

export const staffDashboard = (scope: "season" | "groups") => ({
  variant: "SEASON_STAFF",
  todayOrgDay: "2099-03-01",
  scope,
  season: { id: 7, code: "spring-2099", title: "Spring 2099", status: "ACTIVE" },
  groups:
    scope === "groups"
      ? [
          { id: 5, name: "Group A" },
          { id: 6, name: "Group B" },
        ]
      : [],
  progress: { sessionsHeld: 3, sessionsTotal: 4, pct: 75 },
  nextSession: liveSession,
  cohort: {
    studentCount: 3,
    meanAttendancePct: 33,
    atRiskTotal: 12,
    atRisk: [engagementRow(21, "Sara Student", 33)],
  },
  submissions: { pendingReview: 1, reviewed: 2 },
  quizzes: { total: 2, pending: 2, fullyGraded: 0, drafts: 1 },
});

// Same row shape as Plan 4's use-seasons.test.tsx.
export const seasonRow = {
  id: 7,
  code: "s7",
  title: "Spring 2099",
  program: "TEST",
  year: 2099,
  status: "ACTIVE",
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
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
      status: "ACTIVE",
      activeCount: 20,
      completedCount: 3,
      withdrawnCount: 1,
      leaderCount: 2,
    },
  ],
  alumniByYear: [{ year: 2098, count: 12 }],
  generatedAt: "2099-03-10T00:00:00.000Z",
};
