import { blankToNull } from "../lib/form-values";

describe("blankToNull", () => {
  it("reads blank or whitespace as null", () => {
    expect(blankToNull("")).toBeNull();
    expect(blankToNull("   ")).toBeNull();
    expect(blankToNull("  ", { trim: false })).toBeNull();
  });

  it("trims by default and keeps the edges with trim: false", () => {
    expect(blankToNull("  hi ")).toBe("hi");
    expect(blankToNull("  hi ", { trim: false })).toBe("  hi ");
  });
});
