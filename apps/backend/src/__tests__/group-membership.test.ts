// setGroupStudents with the database mocked: the group form's student list
// comes from the season roster, so removal looks at that same population, or a
// rename strips the group from every member the form could not have listed.

const mockDb = {};
jest.mock("../db/client", () => ({ db: mockDb }));

import type { Prisma } from "../generated/prisma/client";
import { assignStudentsToGroups, setGroupStudents, unassignStudentsFromGroups } from "../lib/groups/membership";
import { seasonRosterMember } from "../lib/queries/season-participants";

const tx = {
  seasonEnrollment: { findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  groupStudent: { deleteMany: jest.fn(), create: jest.fn() },
  group: { findMany: jest.fn() },
};
const asTx = tx as unknown as Prisma.TransactionClient;

beforeEach(() => {
  jest.resetAllMocks();
  tx.seasonEnrollment.findMany.mockResolvedValue([]);
});

describe("setGroupStudents", () => {
  it("looks for removals among the people the roster can list, and nobody else", async () => {
    await setGroupStudents(asTx, 7, 3, [1, 2]);
    expect(tx.seasonEnrollment.findMany).toHaveBeenCalledWith({
      where: { seasonId: 7, groupId: 3, ...seasonRosterMember, studentUserId: { notIn: [1, 2] } },
      select: { studentUserId: true },
    });
  });

  it("leaves members the form can't list alone (a rename in a finished season)", async () => {
    // Nobody the roster can list is in the group, so nothing is unassigned: a
    // member who now serves or was deleted, never returned by the query, keeps
    // their group. Full cases in integration/finished-group-rename.test.ts.
    await setGroupStudents(asTx, 7, 3, []);
    expect(tx.seasonEnrollment.updateMany).not.toHaveBeenCalled();
    expect(tx.groupStudent.deleteMany).not.toHaveBeenCalled();
  });

  it("unassigns exactly the roster members dropped from the list", async () => {
    tx.seasonEnrollment.findMany.mockResolvedValue([{ studentUserId: 4 }]);
    await setGroupStudents(asTx, 7, 3, [1]);
    expect(tx.seasonEnrollment.updateMany).toHaveBeenCalledWith({
      where: { seasonId: 7, groupId: 3, studentUserId: { in: [4] } },
      data: { groupId: null },
    });
    expect(tx.groupStudent.deleteMany).toHaveBeenCalledWith({
      where: { seasonId: 7, groupId: 3, studentUserId: { in: [4] } },
    });
    // And the listed student is (re)pointed at the group.
    expect(tx.seasonEnrollment.update).toHaveBeenCalledWith({
      where: { studentUserId_seasonId: { studentUserId: 1, seasonId: 7 } },
      data: { groupId: 3 },
    });
  });
});

// Plan 18 M1: GroupStudent is one row per student per season. Every write
// replaces only THIS season's row; another season's membership is history.
describe("per-season GroupStudent writes (Plan 18 M1)", () => {
  it("setGroupStudents replaces only this season's row and writes its seasonId", async () => {
    await setGroupStudents(asTx, 7, 3, [1]);
    expect(tx.groupStudent.deleteMany).toHaveBeenCalledWith({ where: { studentUserId: 1, seasonId: 7 } });
    expect(tx.groupStudent.create).toHaveBeenCalledWith({ data: { groupId: 3, studentUserId: 1, seasonId: 7 } });
  });

  it("assignStudentsToGroups never deletes a membership without a season", async () => {
    tx.group.findMany.mockResolvedValue([{ id: 3 }]);
    tx.seasonEnrollment.findMany.mockResolvedValue([{ studentUserId: 1 }]);
    await expect(assignStudentsToGroups(asTx, 7, [{ studentUserId: 1, groupId: 3 }])).resolves.toEqual({
      assigned: 1,
      skippedStudentIds: [],
    });
    expect(tx.groupStudent.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.groupStudent.deleteMany).toHaveBeenCalledWith({ where: { studentUserId: 1, seasonId: 7 } });
    expect(tx.groupStudent.create).toHaveBeenCalledWith({ data: { groupId: 3, studentUserId: 1, seasonId: 7 } });
  });

  it("unassignStudentsFromGroups removes this season's row by its own seasonId", async () => {
    tx.seasonEnrollment.findMany.mockResolvedValue([{ studentUserId: 1 }]);
    await expect(unassignStudentsFromGroups(asTx, 7, [1])).resolves.toEqual({ unassigned: 1, skippedStudentIds: [] });
    expect(tx.groupStudent.deleteMany).toHaveBeenCalledWith({ where: { studentUserId: { in: [1] }, seasonId: 7 } });
    expect(tx.seasonEnrollment.updateMany).toHaveBeenCalledWith({
      where: { studentUserId: { in: [1] }, seasonId: 7 },
      data: { groupId: null },
    });
  });

  it("unassignStudentsFromGroups takes a batch in two statements and skips the ineligible", async () => {
    tx.seasonEnrollment.findMany.mockResolvedValue([{ studentUserId: 1 }, { studentUserId: 3 }]);
    await expect(unassignStudentsFromGroups(asTx, 7, [1, 2, 3])).resolves.toEqual({
      unassigned: 2,
      skippedStudentIds: [2],
    });
    expect(tx.groupStudent.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.groupStudent.deleteMany).toHaveBeenCalledWith({ where: { studentUserId: { in: [1, 3] }, seasonId: 7 } });
    expect(tx.seasonEnrollment.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.seasonEnrollment.update).not.toHaveBeenCalled();
  });

  it("unassignStudentsFromGroups writes nothing when nobody is eligible", async () => {
    await expect(unassignStudentsFromGroups(asTx, 7, [9])).resolves.toEqual({ unassigned: 0, skippedStudentIds: [9] });
    expect(tx.groupStudent.deleteMany).not.toHaveBeenCalled();
    expect(tx.seasonEnrollment.updateMany).not.toHaveBeenCalled();
  });
});
