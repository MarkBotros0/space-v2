import { isAssignmentOutstanding } from "../index";

describe("isAssignmentOutstanding", () => {
  const done = { submittedAt: "2026-11-01T10:00:00Z", partsLeft: 0, returned: false };

  it("is false once handed in with nothing left or returned", () => {
    expect(isAssignmentOutstanding(done)).toBe(false);
  });

  it("is true when not handed in, when parts are left, or when work came back", () => {
    expect(isAssignmentOutstanding({ ...done, submittedAt: null })).toBe(true);
    expect(isAssignmentOutstanding({ ...done, partsLeft: 1 })).toBe(true);
    expect(isAssignmentOutstanding({ ...done, returned: true })).toBe(true);
  });
});
