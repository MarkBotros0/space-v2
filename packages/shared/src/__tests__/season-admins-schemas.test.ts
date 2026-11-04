import { addSeasonAdminRequestSchema, seasonAdminListResponseSchema } from "../index";

describe("season admins contracts", () => {
  it("add takes a positive integer userId and nothing looser", () => {
    expect(addSeasonAdminRequestSchema.parse({ userId: 7 })).toEqual({ userId: 7 });
    for (const body of [{}, { userId: "7" }, { userId: 0 }, { userId: -1 }, { userId: 2.5 }]) {
      expect(addSeasonAdminRequestSchema.safeParse(body).success).toBe(false);
    }
  });

  it("the list allows a null assigner and requires the rest", () => {
    const row = {
      userId: 7,
      name: "Pat",
      email: "p@jpc.test",
      assignedAt: "2026-11-01T10:00:00.000Z",
      assignedByName: null,
    };
    expect(seasonAdminListResponseSchema.parse({ admins: [row] }).admins[0]).toEqual(row);
    const { email: _email, ...missing } = row;
    expect(seasonAdminListResponseSchema.safeParse({ admins: [missing] }).success).toBe(false);
  });
});
