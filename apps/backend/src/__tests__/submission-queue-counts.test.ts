// The reviewer queue's header counts, with the database mocked: computed on
// the first page only, with count() queries over essay works, never by
// loading every row.

const mockDb = {
  assignmentPartWork: { findMany: jest.fn(), count: jest.fn() },
  assignment: { findMany: jest.fn() },
};
jest.mock("../db/client", () => ({ db: mockDb }));

import type { Request, Response } from "express";

import type { SessionUser } from "../lib/auth/tokens";
import { countQueue } from "../routes/submissions/queue-counts";
import { listSubmissionQueue } from "../routes/submissions/queue";

const superUser: SessionUser = {
  userId: 1,
  role: "SUPER",
  seasonAdminIds: [],
  groupLeaderIds: [],
  activeSeasonId: null,
  graduationYear: null,
};

function fakeRes() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}
async function list(query: Record<string, string>) {
  const res = fakeRes();
  await listSubmissionQueue({ user: superUser, query } as unknown as Request, res as unknown as Response);
  return (res.json.mock.calls[0]?.[0] as { data: { counts: unknown } }).data;
}

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.assignmentPartWork.findMany.mockResolvedValue([]);
  mockDb.assignment.findMany.mockResolvedValue([]);
  mockDb.assignmentPartWork.count.mockResolvedValue(0);
});

describe("GET /submissions — header counts", () => {
  it("counts on the first page, and only reads the page's essays", async () => {
    mockDb.assignmentPartWork.count.mockResolvedValueOnce(3).mockResolvedValueOnce(9);
    const data = await list({ pendingOnly: "false" });
    expect(data.counts).toEqual({ pending: 3, total: 9, late: 0 });
    // One findMany: the page itself, capped by take. No unbounded read.
    expect(mockDb.assignmentPartWork.findMany).toHaveBeenCalledTimes(1);
    const page = mockDb.assignmentPartWork.findMany.mock.calls[0][0];
    expect(page.take).toBe(26);
    // Only handed-in essays of live assignments are reachable.
    expect(JSON.stringify(page.where)).toContain('"kind":"ESSAY"');
    expect(JSON.stringify(page.where)).toContain('"not":"DRAFT"');
  });

  it("skips the counts entirely on a cursor page", async () => {
    const data = await list({ pendingOnly: "false", cursor: "abc" });
    expect(data.counts).toBeNull();
    expect(mockDb.assignmentPartWork.count).not.toHaveBeenCalled();
    expect(mockDb.assignment.findMany).not.toHaveBeenCalled();
  });
});

describe("countQueue — late", () => {
  const reachable = { status: { not: "DRAFT" as const } };

  it("pins each assignment to its own due date inside the caller's scope", async () => {
    const due1 = new Date("2099-01-01T00:00:00Z");
    const due2 = new Date("2099-02-01T00:00:00Z");
    mockDb.assignment.findMany.mockResolvedValue([
      { id: 1, dueAt: due1 },
      { id: 2, dueAt: due2 },
    ]);
    mockDb.assignmentPartWork.count
      .mockResolvedValueOnce(2) // pending
      .mockResolvedValueOnce(5) // total
      .mockResolvedValueOnce(4); // late

    expect(await countQueue(reachable)).toEqual({ pending: 2, total: 5, late: 4 });

    // The assignments are only those with a reachable essay.
    expect(mockDb.assignment.findMany.mock.calls[0][0].where).toEqual({
      dueAt: { not: null },
      parts: { some: { work: { some: reachable } } },
    });
    // The late count keeps the scope AND compares each essay's hand-in to its own due date.
    expect(mockDb.assignmentPartWork.count.mock.calls[2][0]).toEqual({
      where: {
        AND: [
          reachable,
          {
            OR: [
              { part: { assignmentId: 1 }, submittedAt: { gt: due1 } },
              { part: { assignmentId: 2 }, submittedAt: { gt: due2 } },
            ],
          },
        ],
      },
    });
  });

  it("is zero without a query when no reachable assignment has a due date", async () => {
    expect((await countQueue(reachable)).late).toBe(0);
    expect(mockDb.assignmentPartWork.count).toHaveBeenCalledTimes(2);
  });
});
