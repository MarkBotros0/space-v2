// flagLowAttendance with the database mocked: the leaders it alerts are those
// of the student's group IN THE SESSION'S SEASON (ruling C9), never whatever
// GroupStudent row the student holds.

const mockDb = {
  session: { findUnique: jest.fn() },
  attendance: { findMany: jest.fn() },
  seasonEnrollment: { findUnique: jest.fn() },
  groupStudent: { findUnique: jest.fn() },
  groupLeader: { findMany: jest.fn() },
  seasonAdmin: { findMany: jest.fn() },
  user: { findUnique: jest.fn() },
};
jest.mock("../db/client", () => ({ db: mockDb }));

const mockNotify = jest.fn();
jest.mock("../lib/notifications", () => ({
  createNotificationsBulk: (...a: unknown[]) => mockNotify(...a),
}));

import { flagLowAttendance } from "../lib/attendance-notifications";

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.session.findUnique.mockResolvedValue({ id: 5, seasonId: 7, startsAt: new Date() });
  mockDb.attendance.findMany.mockResolvedValue([{ status: "ABSENT" }, { status: "ABSENT" }]);
  mockDb.seasonAdmin.findMany.mockResolvedValue([]);
  mockDb.user.findUnique.mockResolvedValue({ name: "A" });
  mockDb.groupLeader.findMany.mockResolvedValue([{ userId: 40 }]);
});

it("finds the group through the session's season enrolment", async () => {
  mockDb.seasonEnrollment.findUnique.mockResolvedValue({ groupId: 3 });
  await flagLowAttendance(5, [{ studentUserId: 11, status: "ABSENT" }]);

  expect(mockDb.seasonEnrollment.findUnique).toHaveBeenCalledWith({
    where: { studentUserId_seasonId: { studentUserId: 11, seasonId: 7 } },
    select: { groupId: true },
  });
  expect(mockDb.groupStudent.findUnique).not.toHaveBeenCalled();
  expect(mockDb.groupLeader.findMany).toHaveBeenCalledWith({
    where: { groupId: 3, user: { deletedAt: null } },
    select: { userId: true },
  });
  expect(mockNotify).toHaveBeenCalledWith([40], expect.objectContaining({ type: "LOW_ATTENDANCE_FLAG" }));
});

it("skips a student with no group in that season, as v1 did", async () => {
  mockDb.seasonEnrollment.findUnique.mockResolvedValue({ groupId: null });
  await flagLowAttendance(5, [{ studentUserId: 11, status: "ABSENT" }]);
  expect(mockDb.groupLeader.findMany).not.toHaveBeenCalled();
  expect(mockNotify).not.toHaveBeenCalled();
});
