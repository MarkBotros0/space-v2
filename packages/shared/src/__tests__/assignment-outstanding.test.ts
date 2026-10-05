import { isAssignmentOutstanding } from "../index";

describe("isAssignmentOutstanding (ruling C5, spec 19 D15)", () => {
  it("is true for PENDING and DRAFT only", () => {
    expect(isAssignmentOutstanding("PENDING")).toBe(true);
    expect(isAssignmentOutstanding("DRAFT")).toBe(true);
  });

  it("treats every C5 'completed' status as not outstanding, RETURNED included", () => {
    expect(isAssignmentOutstanding("SUBMITTED")).toBe(false);
    expect(isAssignmentOutstanding("REVIEWED")).toBe(false);
    expect(isAssignmentOutstanding("RETURNED")).toBe(false);
  });
});
