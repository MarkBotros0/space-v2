// canVotePoll fails closed: a season post takes votes only while its season is ACTIVE.
jest.mock("../db/client", () => ({ db: {} }));

import type { SessionUser } from "../lib/auth/tokens";
import { canVotePoll } from "../lib/permissions";

const student: SessionUser = {
  userId: 1,
  role: "STUDENT",
  seasonAdminIds: [],
  groupLeaderIds: [],
  activeSeasonId: 7,
  graduationYear: null,
};
const superUser: SessionUser = { ...student, userId: 2, role: "SUPER", activeSeasonId: null };

const seasonRow = (status: string) => ({
  audience: "SEASON" as const,
  seasonId: 7,
  authorId: 2,
  season: { status },
});
const communityRow = { audience: "COMMUNITY" as const, seasonId: null, authorId: 2, season: null };

describe("canVotePoll", () => {
  it("lets a reader vote on an open poll in an ACTIVE season", () => {
    expect(canVotePoll(student, seasonRow("ACTIVE"), false)).toBe(true);
  });

  it.each(["DRAFT", "COMPLETED", "ARCHIVED", "SOMETHING_NEW"])(
    "refuses a season that is %s",
    (status) => {
      expect(canVotePoll(student, seasonRow(status), false)).toBe(false);
    },
  );

  it("refuses a season post whose season is missing", () => {
    expect(canVotePoll(student, { ...seasonRow("ACTIVE"), season: null }, false)).toBe(false);
  });

  it("refuses a closed poll", () => {
    expect(canVotePoll(student, seasonRow("ACTIVE"), true)).toBe(false);
    expect(canVotePoll(student, communityRow, true)).toBe(false);
  });

  it("keeps a Super off a season poll, even their own, and lets them vote on a community one", () => {
    expect(canVotePoll(superUser, seasonRow("ACTIVE"), false)).toBe(false);
    expect(canVotePoll(superUser, communityRow, false)).toBe(true);
  });
});
