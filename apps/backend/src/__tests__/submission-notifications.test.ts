// SUBMISSION_RECEIVED with the database mocked: one per Submit naming the
// assignment, one per hand-in naming the essay. Both tell the leaders of the
// student's group IN THE ASSIGNMENT'S SEASON (ruling C9), never season admins.

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
import {
  notifyAssignmentSubmitted,
  notifyEssayHandedIn,
  submissionReceivedLink,
} from "../lib/submission-notifications";

const submitted = {
  studentUserId: 11,
  seasonId: 7,
  assignmentId: 3,
  assignmentTitle: "The Prodigal Son",
  essayPublicId: "Ab3dE5gH9k",
};

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.seasonEnrollment.findUnique.mockResolvedValue({ groupId: 3 });
  mockDb.groupLeader.findMany.mockResolvedValue([{ userId: 40 }, { userId: 41 }]);
  mockDb.user.findUnique.mockResolvedValue({ name: "Salma" });
  mockNotify.mockResolvedValue({ written: 2, suppressed: 0 });
});

describe("notifyAssignmentSubmitted — one per Submit", () => {
  it("names the assignment and opens its first essay", async () => {
    await notifyAssignmentSubmitted(submitted);
    expect(mockDb.seasonEnrollment.findUnique).toHaveBeenCalledWith({
      where: { studentUserId_seasonId: { studentUserId: 11, seasonId: 7 } },
      select: { groupId: true },
    });
    expect(mockDb.groupStudent.findUnique).not.toHaveBeenCalled();
    expect(mockDb.groupLeader.findMany).toHaveBeenCalledWith({
      where: { groupId: 3, user: { deletedAt: null } },
      select: { userId: true },
    });
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith([40, 41], {
      type: "SUBMISSION_RECEIVED",
      title: "Salma submitted The Prodigal Son",
      link: "/leader/submissions/Ab3dE5gH9k",
    });
  });

  it("opens the assignment when it has no essay to review", async () => {
    await notifyAssignmentSubmitted({ ...submitted, essayPublicId: null });
    expect(mockNotify.mock.calls[0][1].link).toBe("/student/assignments/3");
  });

  it("never notifies season admins, the student, or anyone outside a group", async () => {
    await notifyAssignmentSubmitted(submitted);
    expect(mockDb.seasonAdmin.findMany).not.toHaveBeenCalled();

    mockNotify.mockClear();
    mockDb.groupLeader.findMany.mockResolvedValue([{ userId: 11 }]);
    await notifyAssignmentSubmitted(submitted);
    expect(mockNotify).not.toHaveBeenCalled();

    mockDb.seasonEnrollment.findUnique.mockResolvedValue({ groupId: null });
    await notifyAssignmentSubmitted(submitted);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("never rejects into the submit that triggered it", async () => {
    mockNotify.mockRejectedValue(new Error("db down"));
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(notifyAssignmentSubmitted(submitted)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("notifyEssayHandedIn — one per hand-in", () => {
  const handedIn = {
    publicId: "Zz9yX8wV7u",
    studentUserId: 11,
    seasonId: 7,
    assignmentTitle: "The Prodigal Son",
    prompt: "What did the father do?",
  };

  it("names the essay and opens it", async () => {
    await notifyEssayHandedIn(handedIn);
    expect(mockNotify).toHaveBeenCalledWith([40, 41], {
      type: "SUBMISSION_RECEIVED",
      title: "Salma handed in The Prodigal Son again: What did the father do?",
      link: "/leader/submissions/Zz9yX8wV7u",
    });
  });

  it("shortens a long question", async () => {
    await notifyEssayHandedIn({ ...handedIn, prompt: `${"word ".repeat(30)}end` });
    const title = mockNotify.mock.calls[0][1].title as string;
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual("Salma handed in The Prodigal Son again: ".length + 60);
  });
});

it("links to a path the target parser maps to the submission", () => {
  expect(parseNotificationLink(submissionReceivedLink("Ab3dE5gH9k"))).toEqual({
    entityType: "submission",
    entityId: "Ab3dE5gH9k",
  });
});
