// Plan 18 M1 readers with the database mocked. GroupStudent now holds one
// row per student per season, so the student list's advisory "current group"
// is the most recent membership, and the season roster no longer reports a
// membership elsewhere (assigning here cannot remove it any more).

const mockDb = {
  groupStudent: { findMany: jest.fn() },
  seasonEnrollment: { findMany: jest.fn() },
};
jest.mock("../db/client", () => ({ db: mockDb }));

import { listSeasonRoster } from "../lib/queries/groups";
import {
  CURRENT_MEMBERSHIP_ORDER,
  currentMembershipSelect,
  studentIdsWithCurrentGroup,
} from "../lib/queries/students/current-group";

beforeEach(() => jest.resetAllMocks());

describe("currentMembershipSelect", () => {
  it("takes the single most recent membership, season as the tie-break", () => {
    expect(currentMembershipSelect({ name: true })).toEqual({
      orderBy: [{ enrolledAt: "desc" }, { seasonId: "desc" }],
      take: 1,
      select: { group: { select: { name: true } } },
    });
  });
});

describe("studentIdsWithCurrentGroup", () => {
  it("returns nobody without asking twice when the group has no members", async () => {
    mockDb.groupStudent.findMany.mockResolvedValueOnce([]);
    await expect(studentIdsWithCurrentGroup(3)).resolves.toEqual([]);
    expect(mockDb.groupStudent.findMany).toHaveBeenCalledTimes(1);
  });

  it("keeps a member only while the group is their most recent membership", async () => {
    // 1 and 2 were in group 3 (last season); 2 has since been put in group 9.
    mockDb.groupStudent.findMany
      .mockResolvedValueOnce([{ studentUserId: 1 }, { studentUserId: 2 }])
      .mockResolvedValueOnce([
        { studentUserId: 2, groupId: 9 },
        { studentUserId: 1, groupId: 3 },
        { studentUserId: 2, groupId: 3 },
      ]);
    await expect(studentIdsWithCurrentGroup(3)).resolves.toEqual([1]);
    expect(mockDb.groupStudent.findMany).toHaveBeenLastCalledWith({
      where: { studentUserId: { in: [1, 2] } },
      orderBy: CURRENT_MEMBERSHIP_ORDER,
      select: { studentUserId: true, groupId: true },
    });
  });
});

describe("listSeasonRoster", () => {
  it("reads this season's enrolments only, and never another season's membership", async () => {
    mockDb.seasonEnrollment.findMany.mockResolvedValue([
      {
        studentUserId: 5,
        groupId: null,
        group: null,
        studentUser: { name: "Omar", email: "omar@jpc.test" },
      },
    ]);
    await expect(listSeasonRoster(7)).resolves.toEqual([
      { userId: 5, name: "Omar", email: "omar@jpc.test", groupId: null, groupName: null },
    ]);
    expect(mockDb.groupStudent.findMany).not.toHaveBeenCalled();
  });
});
