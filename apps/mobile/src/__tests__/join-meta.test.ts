import { joinMeta } from "../lib/join-meta";

describe("joinMeta", () => {
  it("drops empty, nullish and false parts and keeps numbers", () => {
    expect(joinMeta(["Cairo University", null, "", 3, undefined, false])).toBe("Cairo University · 3");
  });
  it("is empty when nothing is left", () => {
    expect(joinMeta([null])).toBe("");
    expect(joinMeta([])).toBe("");
  });
  it("drops whitespace-only parts and trims the rest", () => {
    expect(joinMeta(["  ", " A ", "\n"])).toBe("A");
  });
  it("keeps a zero", () => {
    expect(joinMeta([0, "x"])).toBe("0 · x");
  });
});
