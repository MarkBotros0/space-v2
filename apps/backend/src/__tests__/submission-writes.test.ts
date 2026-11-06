// Student writes to a submission, with the database mocked: the status lock
// (only DRAFT and RETURNED are editable) and the ACTIVE-enrolment gate.

const mockDb = {
  submission: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), upsert: jest.fn() },
  submissionFile: { count: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
  seasonEnrollment: { findUnique: jest.fn() },
  assignment: { findFirst: jest.fn() },
};
jest.mock("../db/client", () => ({ db: mockDb }));
const mockNotifyReceived = jest.fn();
jest.mock("../lib/submission-notifications", () => ({
  notifySubmissionReceived: (...args: unknown[]) => mockNotifyReceived(...args),
}));
const mockStudentCanSee = jest.fn();
jest.mock("../lib/queries/assignments", () => ({
  ...jest.requireActual("../lib/queries/assignments"),
  studentCanSeeAssignment: (...args: unknown[]) => mockStudentCanSee(...args),
}));

import type { Request, Response } from "express";

import type { SessionUser } from "../lib/auth/tokens";
import { deleteSubmissionFile } from "../routes/submissions/files";
import { startSubmission, updateSubmission } from "../routes/submissions/writes";

const student: SessionUser = {
  userId: 10, role: "STUDENT", seasonAdminIds: [], groupLeaderIds: [],
  activeSeasonId: 7, graduationYear: null,
};

function fakeRes() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}
function req(over: Partial<Request>): Request<{ publicId: string }> {
  return { user: student, params: {}, query: {}, body: {}, ...over } as unknown as Request<{
    publicId: string;
  }>;
}
const errorCode = (res: ReturnType<typeof fakeRes>) =>
  (res.json.mock.calls[0]?.[0] as { error?: { code: string } }).error?.code;

function ownSubmission(status: string) {
  return {
    id: 1,
    publicId: "Ab3dE5gH9k",
    status,
    studentUserId: 10,
    assignment: { seasonId: 7, type: "STANDARD", title: "Essay one" },
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.seasonEnrollment.findUnique.mockResolvedValue({ status: "ACTIVE", season: { status: "ACTIVE", deletedAt: null } });
  mockDb.submission.update.mockResolvedValue({});
  mockDb.submission.updateMany.mockResolvedValue({ count: 1 });
});

describe("PATCH /submissions/:publicId — the status lock", () => {
  it.each(["SUBMITTED", "REVIEWED"])("refuses a save on a %s row with 409", async (status) => {
    mockDb.submission.findUnique.mockResolvedValue(ownSubmission(status));
    for (const body of [{ text: "rewritten" }, { text: "rewritten", submit: true }]) {
      const res = fakeRes();
      await updateSubmission(req({ params: { publicId: "p" }, body }), res as unknown as Response);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(errorCode(res)).toBe("submission_locked");
    }
    expect(mockDb.submission.update).not.toHaveBeenCalled();
    expect(mockDb.submission.updateMany).not.toHaveBeenCalled();
    expect(mockNotifyReceived).not.toHaveBeenCalled();
  });

  it.each(["DRAFT", "RETURNED"])("saves and submits a %s row", async (status) => {
    mockDb.submission.findUnique.mockResolvedValue(ownSubmission(status));
    const res = fakeRes();
    await updateSubmission(
      req({ params: { publicId: "p" }, body: { text: "work", submit: true } }),
      res as unknown as Response,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockDb.submission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, status: { in: ["DRAFT", "RETURNED"] } },
        data: expect.objectContaining({ status: "SUBMITTED" }),
      }),
    );
  });

  it("tells the group's leaders once the submit has committed", async () => {
    mockDb.submission.findUnique.mockResolvedValue(ownSubmission("DRAFT"));
    const res = fakeRes();
    await updateSubmission(
      req({ params: { publicId: "p" }, body: { text: "work", submit: true } }),
      res as unknown as Response,
    );
    expect(mockNotifyReceived).toHaveBeenCalledWith({
      publicId: "Ab3dE5gH9k",
      studentUserId: 10,
      seasonId: 7,
      assignmentTitle: "Essay one",
    });
  });

  it("does not notify on a plain save", async () => {
    mockDb.submission.findUnique.mockResolvedValue(ownSubmission("DRAFT"));
    const res = fakeRes();
    await updateSubmission(req({ params: { publicId: "p" }, body: { text: "work" } }), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockNotifyReceived).not.toHaveBeenCalled();
  });

  it("answers 409 and stays silent when a racing submit moved the row first", async () => {
    mockDb.submission.findUnique.mockResolvedValue(ownSubmission("DRAFT"));
    mockDb.submission.updateMany.mockResolvedValue({ count: 0 });
    const res = fakeRes();
    await updateSubmission(
      req({ params: { publicId: "p" }, body: { text: "work", submit: true } }),
      res as unknown as Response,
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(errorCode(res)).toBe("submission_locked");
    expect(mockNotifyReceived).not.toHaveBeenCalled();
  });

  it.each(["WITHDRAWN", "COMPLETED"])("refuses a %s student with 403", async (enrolment) => {
    mockDb.submission.findUnique.mockResolvedValue(ownSubmission("DRAFT"));
    mockDb.seasonEnrollment.findUnique.mockResolvedValue({ status: enrolment });
    const res = fakeRes();
    await updateSubmission(
      req({ params: { publicId: "p" }, body: { text: "x", submit: true } }),
      res as unknown as Response,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockDb.submission.update).not.toHaveBeenCalled();
    expect(mockDb.submission.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a student with no enrolment in the season at all", async () => {
    mockDb.submission.findUnique.mockResolvedValue(ownSubmission("DRAFT"));
    mockDb.seasonEnrollment.findUnique.mockResolvedValue(null);
    const res = fakeRes();
    await updateSubmission(req({ params: { publicId: "p" }, body: { text: "x" } }), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe("PUT /submissions/by-assignment/:assignmentId — the enrolment gate", () => {
  beforeEach(() => {
    mockDb.assignment.findFirst.mockResolvedValue({
      seasonId: 7, isAllGroups: true, type: "STANDARD", targets: [],
    });
    mockStudentCanSee.mockResolvedValue(true);
    mockDb.submission.upsert.mockResolvedValue({ publicId: "p", status: "DRAFT" });
  });

  it("creates for an ACTIVE student", async () => {
    const res = fakeRes();
    await startSubmission(req({ params: { assignmentId: "3" } as never }), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockDb.submission.upsert).toHaveBeenCalled();
  });

  it("refuses a dropped or alumni student — any enrolment is no longer enough", async () => {
    mockDb.seasonEnrollment.findUnique.mockResolvedValue({ status: "WITHDRAWN" });
    const res = fakeRes();
    await startSubmission(req({ params: { assignmentId: "3" } as never }), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockDb.submission.upsert).not.toHaveBeenCalled();
  });
});

describe("DELETE /submissions/:publicId/files — the same lock", () => {
  it("refuses to remove a file from submitted work", async () => {
    mockDb.submissionFile.findUnique.mockResolvedValue({
      storagePath: "x",
      submission: {
        publicId: "p", studentUserId: 10, status: "SUBMITTED", assignment: { seasonId: 7 },
      },
    });
    const res = fakeRes();
    await deleteSubmissionFile(
      req({ params: { publicId: "p" }, query: { fileId: "4" } }),
      res as unknown as Response,
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockDb.submissionFile.delete).not.toHaveBeenCalled();
  });
});
