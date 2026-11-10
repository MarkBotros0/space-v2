// A DRAFT essay exists only for its author (owner decision, 2026-11): every
// route that addresses an essay by publicId answers anyone else with 404,
// before a role check could leak that it is there. Database mocked.

const mockDb = {
  assignmentPartWork: { findFirst: jest.fn() },
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
const mockReview = jest.fn();
const mockHandIn = jest.fn();
jest.mock("../lib/assignments/essay-review", () => ({ reviewEssay: (...a: unknown[]) => mockReview(...a) }));
jest.mock("../lib/assignments/essay", () => ({ handInEssay: (...a: unknown[]) => mockHandIn(...a) }));

import type { Response } from "express";

import type { SessionUser } from "../lib/auth/tokens";
import { isHiddenDraft } from "../lib/permissions";
import { getSubmission } from "../routes/submissions/detail";
import { deleteSubmissionFile, downloadSubmissionFile, uploadSubmissionFile } from "../routes/submissions/files";
import { handInSubmission, reviewSubmission } from "../routes/submissions/writes";

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
function req(caller: SessionUser, over: Record<string, unknown> = {}) {
  return { user: caller, params: { publicId: "p" }, query: {}, body: {}, ...over } as never;
}
const errorCode = (res: ReturnType<typeof fakeRes>) =>
  (res.json.mock.calls[0]?.[0] as { error?: { code: string } }).error?.code;

/** An essay work row with everything the detail, review, hand-in and upload selects read. */
function essayRow(status: string) {
  return {
    id: 1,
    publicId: "p",
    status,
    studentUserId: AUTHOR,
    submissionId: 2,
    text: null,
    feedback: null,
    submittedAt: null,
    reviewedAt: null,
    files: [],
    studentUser: { name: "Student", email: "s@example.com" },
    part: {
      id: 4,
      assignmentId: 3,
      prompt: "Why?",
      minWords: null,
      maxWords: null,
      maxFileSizeMb: null,
      allowedMimeCategories: [],
      assignment: { title: "Essay", dueAt: null, description: null, seasonId: 7, season: { code: "S7" } },
    },
  };
}
function fileRow(status: string) {
  return {
    storagePath: "x",
    originalName: "a.txt",
    mimeType: "text/plain",
    sizeBytes: 1,
    partWork: {
      publicId: "p",
      status,
      studentUserId: AUTHOR,
      submissionId: 2,
      part: { assignment: { seasonId: 7 } },
    },
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

  it.each(["SUBMITTED", "REVIEWED", "RETURNED"])("never hides a %s essay", (status) => {
    for (const caller of staff) {
      expect(isHiddenDraft(caller, { status, studentUserId: AUTHOR })).toBe(false);
    }
  });
});

describe("GET /submissions/:publicId", () => {
  it.each(staff.map((s) => [s.role, s] as const))("is 404 to %s on a DRAFT", async (_r, caller) => {
    mockDb.assignmentPartWork.findFirst.mockResolvedValue(essayRow("DRAFT"));
    const res = fakeRes();
    await getSubmission(req(caller), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(errorCode(res)).toBe("not_found");
    expect(mockCanView).not.toHaveBeenCalled();
  });

  it("still serves the author their own draft", async () => {
    mockDb.assignmentPartWork.findFirst.mockResolvedValue(essayRow("DRAFT"));
    const res = fakeRes();
    await getSubmission(req(user("STUDENT", AUTHOR)), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCanView).toHaveBeenCalledWith(expect.anything(), 2);
  });

  it("still serves staff a RETURNED essay", async () => {
    mockDb.assignmentPartWork.findFirst.mockResolvedValue(essayRow("RETURNED"));
    const res = fakeRes();
    await getSubmission(req(user("LEADER")), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("POST /submissions/:publicId/review and /hand-in", () => {
  it.each([
    { action: "reviewed", feedback: "x" },
    { action: "return", feedback: "x" },
  ])("review is 404 on a DRAFT (%o) and writes nothing", async (body) => {
    mockDb.assignmentPartWork.findFirst.mockResolvedValue(essayRow("DRAFT"));
    const res = fakeRes();
    await reviewSubmission(req(user("ADMIN"), { body }), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("hand-in is 404 to a non-author on a DRAFT, not 403", async () => {
    mockDb.assignmentPartWork.findFirst.mockResolvedValue(essayRow("DRAFT"));
    const res = fakeRes();
    await handInSubmission(req(user("STUDENT")), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockHandIn).not.toHaveBeenCalled();
  });
});

describe("essay files on a DRAFT", () => {
  it("download is 404 to staff and never opens storage", async () => {
    mockDb.submissionFile.findUnique.mockResolvedValue(fileRow("DRAFT"));
    for (const caller of staff) {
      const res = fakeRes();
      await downloadSubmissionFile(req(caller, { params: { publicId: "p", fileId: "4" } }), res as unknown as Response);
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

    mockDb.assignmentPartWork.findFirst.mockResolvedValue(essayRow("DRAFT"));
    const up = fakeRes();
    await uploadSubmissionFile(req(user("ADMIN")), up as unknown as Response);
    expect(up.status).toHaveBeenCalledWith(404);
  });
});
