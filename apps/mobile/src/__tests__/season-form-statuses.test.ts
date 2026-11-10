import { allowedSeasonStatuses } from "../screens/season-form/season-form";

describe("allowedSeasonStatuses", () => {
  it("only offers moves the server allows outside the end flow", () => {
    expect(allowedSeasonStatuses("DRAFT")).toEqual(["DRAFT"]);
    expect(allowedSeasonStatuses("ACTIVE")).toEqual(["ACTIVE"]);
    expect(allowedSeasonStatuses("COMPLETED")).toEqual(["COMPLETED", "ARCHIVED"]);
    expect(allowedSeasonStatuses("ARCHIVED")).toEqual(["ARCHIVED", "COMPLETED"]);
  });
});
