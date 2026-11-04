// setGroupStudents with the database mocked: the group form's student list
// comes from the ACTIVE-only season roster, so removal must be limited to
// ACTIVE enrolments or a rename strips every COMPLETED member's group.

const mockDb = {};
jest.mock("../db/client", () => ({ db: mockDb }));

import type { Prisma } from "../generated/prisma/client";
import { setGroupStudents } from "../lib/queries/groups";

const tx = {
  seasonEnrollment: { findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  groupStudent: { deleteMany: jest.fn(), create: jest.fn() },
};
const asTx = tx as unknown as Prisma.TransactionClient;

beforeEach(() => {
  jest.resetAllMocks();
  tx.seasonEnrollment.findMany.mockResolvedValue([]);
});

describe("setGroupStudents", () => {
  it("looks for removals among ACTIVE enrolments only", async () => {
    await setGroupStudents(asTx, 7, 3, [1, 2]);
    expect(tx.seasonEnrollment.findMany).toHaveBeenCalledWith({
      where: { seasonId: 7, groupId: 3, status: "ACTIVE", studentUserId: { notIn: [1, 2] } },
      select: { studentUserId: true },
    });
  });

  it("leaves COMPLETED members alone when the list is empty (a rename in a finished season)", async () => {
    // Nothing ACTIVE is in the group, so nothing is unassigned — the
    // COMPLETED members the query never returned keep their group.
    await setGroupStudents(asTx, 7, 3, []);
    expect(tx.seasonEnrollment.updateMany).not.toHaveBeenCalled();
    expect(tx.groupStudent.deleteMany).not.toHaveBeenCalled();
  });

  it("unassigns exactly the ACTIVE members dropped from the list", async () => {
    tx.seasonEnrollment.findMany.mockResolvedValue([{ studentUserId: 4 }]);
    await setGroupStudents(asTx, 7, 3, [1]);
    expect(tx.seasonEnrollment.updateMany).toHaveBeenCalledWith({
      where: { seasonId: 7, groupId: 3, studentUserId: { in: [4] } },
      data: { groupId: null },
    });
    expect(tx.groupStudent.deleteMany).toHaveBeenCalledWith({
      where: { groupId: 3, studentUserId: { in: [4] } },
    });
    // And the listed student is (re)pointed at the group.
    expect(tx.seasonEnrollment.update).toHaveBeenCalledWith({
      where: { studentUserId_seasonId: { studentUserId: 1, seasonId: 7 } },
      data: { groupId: 3 },
    });
  });
});
