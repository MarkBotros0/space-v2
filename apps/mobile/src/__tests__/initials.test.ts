import { initialsOf } from "../lib/initials";

describe("initialsOf (v1 more-menu / student profile / student season)", () => {
  it("takes the first letters of the first two words, uppercased", () => {
    expect(initialsOf("Mina Adel", "?")).toBe("MA");
    expect(initialsOf("mina adel botros", "?")).toBe("MA");
    expect(initialsOf("  mina  ", "?")).toBe("M");
  });

  it("falls back when there is no usable name", () => {
    expect(initialsOf(null, "S")).toBe("S");
    expect(initialsOf("   ", "S")).toBe("S");
  });
});
