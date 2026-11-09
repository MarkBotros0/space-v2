import { liveAssignment, liveSeason, liveStudentProfile, liveUser, withDeleted } from "../lib/db/live";

describe("soft-delete fragments", () => {
  it("each live fragment is exactly deletedAt: null", () => {
    for (const fragment of [liveUser, liveSeason, liveAssignment, liveStudentProfile]) {
      expect(fragment).toEqual({ deletedAt: null });
    }
  });

  it("withDeleted filters nothing", () => {
    expect(withDeleted).toEqual({});
  });

  it("spreads into a where without changing its other keys", () => {
    expect({ id: 3, ...liveSeason }).toEqual({ id: 3, deletedAt: null });
  });
});
