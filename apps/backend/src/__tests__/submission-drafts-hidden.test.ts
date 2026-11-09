// A DRAFT exists only for its author (owner decision, 2026-11): every route
// that addresses a submission by publicId answers anyone else with 404, before
// a role check could leak that it is there. Database mocked.

const mockDb = {
  submission: { findUnique: jest.fn(), update: jest.fn() },
  submissionFile: { findUnique: jest.fn(), delete: jest.fn() },
  seasonEnrollment: { findUnique: jest.fn() },
};
jest.mock("../db/client", () => ({ db: mockDb }));
const mockCanView = jest.fn();
const mockCanReview = jest.fn();
jest.mock("../lib/permissions", () => ({
  ...jest.requireActual("../lib/permissions"),
  canViewSubmission: (...args: unknown[]) => mockCanView(...args),
  canReviewSubmission: (...args: unknown[]) => mockCanReview(...args),
}));

import type { Request, Response } from "express";

import type { SessionUser } from "../lib/auth/tokens";
import { isHiddenDraft } from "../lib/permissions";
import { getSubmission } from "../routes/submissions/detail";
import { deleteSubmissionFile, downloadSubmissionFile, uploadSubmissionFile } from "../routes/submissions/files";
import { reviewSubmission, updateSubmission } from "../routes/submissions/writes";

const AUTHOR = 10;
function user(role: SessionUser["role"], userId = 99): SessionUser {
  return {
    userId,
    role,
    seasonAdminIds: [7],
    groupLeaderIds: [5],
    activeSeasonId: 7,
    graduationYear: null,
  };
}
const staff = [user("SUPER"), user("MENTOR"), user("ADMIN"), user("LEADER")];

function fakeRes() {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}
function req(caller: SessionUser, over: Partial<Request> = {}) {
  return { user: caller, params: { publicId: "p" }, query: {}, body: {}, ...over } as never;
}
const errorCode = (res: ReturnType<typeof fakeRes>) =>
  (res.json.mock.calls[0]?.[0] as { error?: { code: string } }).error?.code;

function submissionRow(status: string) {
  return {
    id: 1,
    publicId: "p",
    status,
    studentUserId: AUTHOR,
    text: null,
    feedback: null,
    submittedAt: null,
    reviewedAt: null,
    assignmentId: 3,
    assignment: {
      title: "Essay",
      dueAt: null,
      description: null,
      seasonId: 7,
      type: "STANDARD",
      season: { code: "S7" },
      maxFileSizeMb: null,
      allowedMimeCategories: [],
    },
    studentUser: { name: "Student", email: "s@example.com" },
    files: [],
  };
}
function fileRow(status: string) {
  return {
    storagePath: "x",
    originalName: "a.txt",
    mimeType: "text/plain",
    sizeBytes: 1,
    submission: { id: 1, publicId: "p", status, studentUserId: AUTHOR, assignment: { seasonId: 7 } },
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockCanView.mockResolvedValue(true);
  mockCanReview.mockResolvedValue(true);
  mockDb.seasonEnrollment.findUnique.mockResolvedValue(null);
});

describe("isHiddenDraft", () => {
  it("hides a DRAFT from everyone but its author", () => {
    for (const caller of staff) {
      expect(isHiddenDraft(caller, { status: "DRAFT", studentUserId: AUTHOR })).toBe(true);
    }
    expect(isHiddenDraft(user("STUDENT"), { status: "DRAFT", studentUserId: AUTHOR })).toBe(true);
    expect(isHiddenDraft(user("STUDENT", AUTHOR), { status: "DRAFT", studentUserId: AUTHOR })).toBe(false);
  });

  it.each(["SUBMITTED", "REVIEWED", "RETURNED"])("never hides a %s row", (status) => {
    for (const caller of staff) {
      expect(isHiddenDraft(caller, { status, studentUserId: AUTHOR })).toBe(false);
    }
  });
});

describe("GET /submissions/:publicId", () => {
  it.each(staff.map((s) => [s.role, s] as const))("is 404 to %s on a DRAFT", async (_r, caller) => {
    mockDb.submission.findUnique.mockResolvedValue(submissionRow("DRAFT"));
    const res = fakeRes();
    await getSubmission(req(caller), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(errorCode(res)).toBe("not_found");
    expect(mockCanView).not.toHaveBeenCalled();
  });

  it("still serves the author their own draft", async () => {
    mockDb.submission.findUnique.mockResolvedValue(submissionRow("DRAFT"));
    const res = fakeRes();
    await getSubmission(req(user("STUDENT", AUTHOR)), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("still serves staff a RETURNED submission", async () => {
    mockDb.submission.findUnique.mockResolvedValue(submissionRow("RETURNED"));
    const res = fakeRes();
    await getSubmission(req(user("LEADER")), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("POST /submissions/:publicId/review", () => {
  it.each([{ feedback: "x" }, { feedback: "x", returnForRevision: true }])(
    "is 404 on a DRAFT (%o) and writes nothing",
    async (body) => {
      mockDb.submission.findUnique.mockResolvedValue(submissionRow("DRAFT"));
      const res = fakeRes();
      await reviewSubmission(req(user("ADMIN"), { body }), res as unknown as Response);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockDb.submission.update).not.toHaveBeenCalled();
    },
  );
});

describe("PATCH /submissions/:publicId", () => {
  it("is 404 to a non-author on a DRAFT, not 403", async () => {
    mockDb.submission.findUnique.mockResolvedValue(submissionRow("DRAFT"));
    const res = fakeRes();
    await updateSubmission(req(user("ADMIN"), { body: { text: "x" } }), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("submission files on a DRAFT", () => {
  it("download is 404 to staff and never opens storage", async () => {
    mockDb.submissionFile.findUnique.mockResolvedValue(fileRow("DRAFT"));
    for (const caller of staff) {
      const res = fakeRes();
      await downloadSubmissionFile(
        req(caller, { params: { publicId: "p", fileId: "4" } as never }),
        res as unknown as Response,
      );
      expect(res.status).toHaveBeenCalledWith(404);
    }
    expect(mockCanView).not.toHaveBeenCalled();
  });

  it("delete and upload are 404 to a non-author", async () => {
    mockDb.submissionFile.findUnique.mockResolvedValue(fileRow("DRAFT"));
    const del = fakeRes();
    await deleteSubmissionFile(req(user("LEADER"), { query: { fileId: "4" } }), del as unknown as Response);
    expect(del.status).toHaveBeenCalledWith(404);
    expect(mockDb.submissionFile.delete).not.toHaveBeenCalled();

    mockDb.submission.findUnique.mockResolvedValue(submissionRow("DRAFT"));
    const up = fakeRes();
    await uploadSubmissionFile(req(user("ADMIN")), up as unknown as Response);
    expect(up.status).toHaveBeenCalledWith(404);
  });
});
