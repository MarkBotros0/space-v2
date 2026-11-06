// setGroupStudents with the database mocked: the group form's student list
// comes from the season roster, so removal looks at that same population and
// never at someone the form could not have listed (a WITHDRAWN member).

const mockDb = {};
jest.mock("../db/client", () => ({ db: mockDb }));

import type { Prisma } from "../generated/prisma/client";
import { assignStudentsToGroups, setGroupStudents, unassignStudentsFromGroups } from "../lib/queries/groups";
import { seasonParticipant } from "../lib/queries/season-participants";

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
  it("looks for removals among the season's participants only", async () => {
    await setGroupStudents(asTx, 7, 3, [1, 2]);
    expect(tx.seasonEnrollment.findMany).toHaveBeenCalledWith({
      where: { seasonId: 7, groupId: 3, ...seasonParticipant, studentUserId: { notIn: [1, 2] } },
      select: { studentUserId: true },
    });
  });

  it("touches nobody when the query finds no participant to remove", async () => {
    await setGroupStudents(asTx, 7, 3, []);
    expect(tx.seasonEnrollment.updateMany).not.toHaveBeenCalled();
    expect(tx.groupStudent.deleteMany).not.toHaveBeenCalled();
  });

  it("unassigns exactly the participants dropped from the list", async () => {
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
    expect(tx.groupStudent.deleteMany).toHaveBeenCalledWith({ where: { studentUserId: 1, seasonId: 7 } });
  });
});
