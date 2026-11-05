// notifySubmissionReceived with the database mocked: it tells the leaders of
// the student's group IN THE ASSIGNMENT'S SEASON (ruling C9), never season
// admins, and points at the submission itself.

const mockDb = {
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

import { parseNotificationLink } from "../lib/notification-target";
import { notifySubmissionReceived, submissionReceivedLink } from "../lib/submission-notifications";

const sub = { publicId: "Ab3dE5gH9k", studentUserId: 11, seasonId: 7, assignmentTitle: "Essay one" };

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.seasonEnrollment.findUnique.mockResolvedValue({ groupId: 3 });
  mockDb.groupLeader.findMany.mockResolvedValue([{ userId: 40 }, { userId: 41 }]);
  mockDb.user.findUnique.mockResolvedValue({ name: "Salma" });
  mockNotify.mockResolvedValue({ written: 2, suppressed: 0 });
});

it("notifies the leaders of the student's group in the assignment's season", async () => {
  await notifySubmissionReceived(sub);

  expect(mockDb.seasonEnrollment.findUnique).toHaveBeenCalledWith({
    where: { studentUserId_seasonId: { studentUserId: 11, seasonId: 7 } },
    select: { groupId: true },
  });
  expect(mockDb.groupStudent.findUnique).not.toHaveBeenCalled();
  expect(mockDb.groupLeader.findMany).toHaveBeenCalledWith({
    where: { groupId: 3, user: { deletedAt: null } },
    select: { userId: true },
  });
  expect(mockNotify).toHaveBeenCalledWith([40, 41], {
    type: "SUBMISSION_RECEIVED",
    title: "Salma submitted Essay one",
    link: "/leader/submissions/Ab3dE5gH9k",
  });
});

it("never notifies season admins", async () => {
  await notifySubmissionReceived(sub);
  expect(mockDb.seasonAdmin.findMany).not.toHaveBeenCalled();
});

it("notifies nobody for a student with no group in that season", async () => {
  mockDb.seasonEnrollment.findUnique.mockResolvedValue({ groupId: null });
  await notifySubmissionReceived(sub);
  expect(mockDb.groupLeader.findMany).not.toHaveBeenCalled();
  expect(mockNotify).not.toHaveBeenCalled();
});

it("notifies nobody when the group has no leader, and never the student", async () => {
  mockDb.groupLeader.findMany.mockResolvedValue([{ userId: 11 }]);
  await notifySubmissionReceived(sub);
  expect(mockNotify).not.toHaveBeenCalled();
});

it("never rejects into the submit that triggered it", async () => {
  mockNotify.mockRejectedValue(new Error("db down"));
  const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  await expect(notifySubmissionReceived(sub)).resolves.toBeUndefined();
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});

it("links to a path the target parser maps to the submission", () => {
  expect(parseNotificationLink(submissionReceivedLink("Ab3dE5gH9k"))).toEqual({
    entityType: "submission",
    entityId: "Ab3dE5gH9k",
  });
});
