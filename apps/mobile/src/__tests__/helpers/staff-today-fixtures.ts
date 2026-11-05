// Fixtures for the admin-today / super-today suites. Routes are served by
// `serve()` from dashboard-fixtures; `get` is the suite's apiClient mock.
import { EVENTS, UNREAD, events, seasonRow, staffDashboard } from "./dashboard-fixtures";

const MIN = 60_000;

/** A season-sessions row. `startedMinAgo` > duration puts it in the past. */
export function sessionRow(id: number, seasonId: number, startedMinAgo: number, marked = false, durationMinutes = 90) {
  const startsAt = new Date(Date.now() - startedMinAgo * MIN).toISOString();
  return {
    id,
    title: `Week ${id}`,
    startsAt,
    dayKey: startsAt.slice(0, 10),
    startTime: "18:00",
    durationMinutes,
    location: "Hall",
    recurrenceGroupId: null,
    attendanceMarked: marked,
    seasonId,
    seasonCode: `s${seasonId}`,
    seasonTitle: `Season ${seasonId}`,
    checkInToken: null,
    checkInOpenAt: null,
    checkInClosedAt: null,
  };
}

export const seasonFixture = (id: number, status = "ACTIVE", startDate = "2099-01-01T00:00:00.000Z") => ({
  ...seasonRow,
  id,
  code: `s${id}`,
  title: `Season ${id}`,
  status,
  startDate,
});

export const queue = (pending: number) => ({ items: [], counts: { pending, total: 9, late: 0 }, nextCursor: null });
export const atRiskPage = (total: number) => ({
  scope: { seasonIds: [], seasons: [], truncated: false, label: "x" },
  rows: [],
  nextCursor: null,
  total,
});

export type Table = Record<string, unknown>;
/** Base routes for a signed-in staff user with season 7; override per test. */
export function staffRoutes(over: Table = {}): Table {
  return {
    "/api/v1/seasons": { seasons: [seasonFixture(7)] },
    // sessionRow's dayKey is the real day, so the org's today is too (else live rows read as past).
    "/api/v1/me/dashboard?seasonId=7": {
      ...staffDashboard("season"),
      todayOrgDay: new Date().toISOString().slice(0, 10),
    },
    "/api/v1/seasons/7/sessions": { sessions: [sessionRow(1, 7, 600), sessionRow(2, 7, 700, true)] },
    [EVENTS]: events,
    [UNREAD]: { unreadCount: 0 },
    "/api/v1/users/invites/pending": { pending: 0 },
    ...over,
  };
}

const ok = (data: unknown) => Promise.resolve({ data: { data } });

/**
 * Installs the `apiClient.get` mock: exact URLs from `table`, plus the two
 * query-string reads (queue, engagement) by prefix. A value that is an Error
 * rejects. Anything unlisted rejects, so a stray request shows up.
 */
export function serveStaff(
  get: jest.Mock,
  { table = staffRoutes(), pending = 3, atRisk = 2 }: { table?: Table; pending?: number; atRisk?: number } = {},
) {
  get.mockImplementation((url: string) => {
    let v: unknown;
    if (url in table) v = table[url];
    else if (url.startsWith("/api/v1/submissions?")) v = queue(pending);
    else if (url.startsWith("/api/v1/reports/engagement/students")) v = atRiskPage(atRisk);
    else return Promise.reject(new Error(`not served: ${url}`));
    return v instanceof Error ? Promise.reject(v) : ok(v);
  });
}
