// A student's writes to their own essays, with the database and the essay
// services mocked: who may write (an ACTIVE enrolment, the author only), and
// that a refusal writes and notifies nothing.

const mockDb = {
  assignmentPart: { findFirst: jest.fn() },
  assignmentPartWork: { findFirst: jest.fn() },
  submissionFile: { findUnique: jest.fn(), delete: jest.fn() },
  seasonEnrollment: { findUnique: jest.fn() },
};
jest.mock("../db/client", () => ({ db: mockDb }));
const mockSaveDraft = jest.fn();
const mockHandIn = jest.fn();
jest.mock("../lib/assignments/essay", () => ({
  saveEssayDraft: (...args: unknown[]) => mockSaveDraft(...args),
  handInEssay: (...args: unknown[]) => mockHandIn(...args),
}));
const mockNotifyHandedIn = jest.fn();
jest.mock("../lib/submission-notifications", () => ({
  notifyEssayHandedIn: (...args: unknown[]) => mockNotifyHandedIn(...args),
}));

import type { Request, Response } from "express";

import { ApiError } from "../lib/api-error";
import type { SessionUser } from "../lib/auth/tokens";
import { putEssayDraft } from "../routes/assignments/essay";
import { deleteSubmissionFile } from "../routes/submissions/files";
import { handInSubmission } from "../routes/submissions/writes";

const student: SessionUser = {
  userId: 10,
  role: "STUDENT",
  seasonAdminIds: [],
  groupLeaderIds: [],
  activeSeasonId: 7,
  graduationYear: null,
};
const leader: SessionUser = { ...student, userId: 20, role: "LEADER", groupLeaderIds: [5] };

function fakeRes() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}
function req(over: Partial<Request>, user: SessionUser = student): Request<{ publicId: string }> {
  return { user, params: {}, query: {}, body: {}, ...over } as unknown as Request<{ publicId: string }>;
}
const errorCode = (res: ReturnType<typeof fakeRes>) =>
  (res.json.mock.calls[0]?.[0] as { error?: { code: string } }).error?.code;

function essayWork(status: string, studentUserId = 10) {
  return {
    id: 1,
    publicId: "Ab3dE5gH9k",
    status,
    studentUserId,
    submissionId: 2,
    part: {
      assignmentId: 3,
      prompt: "What did you learn?",
      maxFileSizeMb: null,
      allowedMimeCategories: [],
      assignment: { seasonId: 7, title: "Essay one" },
    },
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.seasonEnrollment.findUnique.mockResolvedValue({
    status: "ACTIVE",
    season: { status: "ACTIVE", deletedAt: null },
  });
  mockDb.assignmentPart.findFirst.mockResolvedValue({ id: 4, assignment: { seasonId: 7 } });
});

describe("PUT /assignments/:id/parts/:partId/essay — who may save a draft", () => {
  const draftReq = (body: object, user = student) => req({ params: { id: "3", partId: "4" } as never, body }, user);

  it("saves the caller's own draft through the service", async () => {
    mockSaveDraft.mockResolvedValue({ publicId: "p", wordCount: 1, reviewStatus: "DRAFT" });
    const res = fakeRes();
    await putEssayDraft(draftReq({ text: "hello" }), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockSaveDraft).toHaveBeenCalledWith(4, 10, "hello");
    expect(mockDb.assignmentPart.findFirst.mock.calls[0][0].where).toMatchObject({ id: 4, assignmentId: 3 });
  });

  it.each(["WITHDRAWN", "COMPLETED"])("refuses a %s student with 403", async (status) => {
    mockDb.seasonEnrollment.findUnique.mockResolvedValue({ status, season: { status: "ACTIVE", deletedAt: null } });
    const res = fakeRes();
    await putEssayDraft(draftReq({ text: "x" }), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSaveDraft).not.toHaveBeenCalled();
  });

  it("refuses staff, who have no essay of their own", async () => {
    const res = fakeRes();
    await putEssayDraft(draftReq({ text: "x" }, leader), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSaveDraft).not.toHaveBeenCalled();
  });

  it("answers 404 for a part that is not an essay of this assignment, and 400 for a bad body", async () => {
    mockDb.assignmentPart.findFirst.mockResolvedValueOnce(null);
    const missing = fakeRes();
    await putEssayDraft(draftReq({ text: "x" }), missing as unknown as Response);
    expect(missing.status).toHaveBeenCalledWith(404);

    const bad = fakeRes();
    await putEssayDraft(draftReq({ text: 5 }), bad as unknown as Response);
    expect(bad.status).toHaveBeenCalledWith(400);
    expect(mockSaveDraft).not.toHaveBeenCalled();
  });
});

describe("POST /submissions/:publicId/hand-in — who may hand in", () => {
  const handInReq = (user = student) => req({ params: { publicId: "Ab3dE5gH9k" } }, user);

  it("hands in through the service and tells the leaders once, naming the essay", async () => {
    mockDb.assignmentPartWork.findFirst.mockResolvedValue(essayWork("RETURNED"));
    mockHandIn.mockResolvedValue({ reviewStatus: "SUBMITTED", assignmentSubmitted: true });
    const res = fakeRes();
    await handInSubmission(handInReq(), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockHandIn).toHaveBeenCalledWith("Ab3dE5gH9k", 10);
    expect(mockNotifyHandedIn).toHaveBeenCalledTimes(1);
    expect(mockNotifyHandedIn).toHaveBeenCalledWith({
      publicId: "Ab3dE5gH9k",
      studentUserId: 10,
      seasonId: 7,
      assignmentTitle: "Essay one",
      prompt: "What did you learn?",
    });
  });

  it("tells nobody when the service refuses", async () => {
    mockDb.assignmentPartWork.findFirst.mockResolvedValue(essayWork("RETURNED"));
    mockHandIn.mockRejectedValue(new ApiError("word_range", "This is 3 words; it needs at least 5.", 400));
    await expect(handInSubmission(handInReq(), fakeRes() as unknown as Response)).rejects.toThrow(ApiError);
    expect(mockNotifyHandedIn).not.toHaveBeenCalled();
  });

  it("refuses someone else's essay with 403, and a withdrawn author too", async () => {
    mockDb.assignmentPartWork.findFirst.mockResolvedValue(essayWork("RETURNED"));
    await expect(handInSubmission(handInReq(leader), fakeRes() as unknown as Response)).rejects.toThrow();
    mockDb.seasonEnrollment.findUnique.mockResolvedValue({ status: "WITHDRAWN" });
    const res = fakeRes();
    await handInSubmission(handInReq(), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockHandIn).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown essay", async () => {
    mockDb.assignmentPartWork.findFirst.mockResolvedValue(null);
    const res = fakeRes();
    await handInSubmission(handInReq(), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("DELETE /submissions/:publicId/files — the status lock", () => {
  it("refuses to remove a file from a handed-in essay", async () => {
    mockDb.submissionFile.findUnique.mockResolvedValue({
      storagePath: "x",
      partWork: {
        publicId: "p",
        studentUserId: 10,
        status: "SUBMITTED",
        submissionId: 2,
        part: { assignment: { seasonId: 7 } },
      },
    });
    const res = fakeRes();
    await deleteSubmissionFile(req({ params: { publicId: "p" }, query: { fileId: "4" } }), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(errorCode(res)).toBe("submission_locked");
    expect(mockDb.submissionFile.delete).not.toHaveBeenCalled();
  });
});
