/** Fixtures for the season overview and edit screen tests. */
import { apiClient } from "../../lib/api-client";

export const detail = (over: Record<string, unknown> = {}) => ({
  id: 7,
  code: "s7",
  title: "TEST 2099",
  program: "TEST",
  year: 2099,
  status: "DRAFT",
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
  description: "Spring.",
  sessionCount: 1,
  studentCount: 4,
  absenceBudgetMinutes: 240,
  absenceWeightMinutes: 90,
  canAdminister: true,
  groups: [{ id: 3, name: "Group A", studentCount: 4, leaderNames: ["Lina"] }],
  ...over,
});
export const sessionRow = {
  id: 12,
  title: "Kickoff",
  startsAt: "2099-03-01T18:00:00.000Z",
  dayKey: "2099-03-01",
  startTime: "20:00",
  durationMinutes: 90,
  location: null,
  recurrenceGroupId: null,
  attendanceMarked: false,
  seasonId: 7,
  seasonCode: "s7",
  seasonTitle: "TEST 2099",
  checkInToken: null,
  checkInOpenAt: null,
  checkInClosedAt: null,
};

const pat = { userId: 30, name: "Pat Admin", email: "pat@jpc.test", assignedAt: "2099-01-02T00:00:00.000Z", assignedByName: "Su" };
export const student = (userId: number, name: string, groupId: number | null) => ({
  userId, name, email: `${userId}@jpc.test`, groupId, groupName: null,
});
const roster = [student(21, "Sara Student", 3), student(22, "Omar Odeh", 3), student(23, "Nadia Nour", null)];

export function routeGets(d: ReturnType<typeof detail>) {
  (apiClient.get as jest.Mock).mockImplementation((url: string) => {
    if (url === "/api/v1/seasons/by-code/s7") return Promise.resolve({ data: { data: d } });
    if (url === "/api/v1/seasons/7/sessions")
      return Promise.resolve({ data: { data: { sessions: [sessionRow] } } });
    if (url === "/api/v1/seasons/7/admins") return Promise.resolve({ data: { data: { admins: [pat] } } });
    if (url === "/api/v1/seasons/7/roster") return Promise.resolve({ data: { data: { roster } } });
    if (url.startsWith("/api/v1/me/dashboard")) return Promise.reject(new Error("not needed"));
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

