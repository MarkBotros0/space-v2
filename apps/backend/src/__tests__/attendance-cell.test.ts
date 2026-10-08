import { attendanceCellFor } from "../lib/exports/attendance-cell";

describe("attendanceCellFor (M3, ruling C3)", () => {
  it("prints the minutes for a LATE row that has them", () => {
    expect(attendanceCellFor("LATE", 7)).toBe(7);
    expect(attendanceCellFor("LATE", 0)).toBe(0);
  });
  it("falls back to L for a LATE row without minutes", () => {
    expect(attendanceCellFor("LATE", null)).toBe("L");
  });
  it("prints P and A for the others, and nothing for no record", () => {
    expect(attendanceCellFor("PRESENT", 12)).toBe("P");
    expect(attendanceCellFor("ABSENT", null)).toBe("A");
    expect(attendanceCellFor(undefined, null)).toBe("");
  });
});
