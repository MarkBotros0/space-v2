import { joinMeta } from "../lib/join-meta";

describe("joinMeta", () => {
  it("drops empty, nullish and false parts and keeps numbers", () => {
    expect(joinMeta(["Cairo University", null, "", 3, undefined, false])).toBe("Cairo\u00A0University\u00A0· 3");
  });
  it("is empty when nothing is left", () => {
    expect(joinMeta([null])).toBe("");
    expect(joinMeta([])).toBe("");
  });
  it("drops whitespace-only parts and trims the rest", () => {
    expect(joinMeta(["  ", " A ", "\n"])).toBe("A");
  });
  it("holds each short fact on one line and the dot with the fact before it", () => {
    expect(joinMeta(["Last login Nov 16", "Group B"])).toBe("Last\u00A0login\u00A0Nov\u00A016\u00A0· Group\u00A0B");
  });
  it("lets a long part wrap between its words, and leaves a lone part alone", () => {
    const title = "Essay: What stayed with you from the opening night";
    expect(joinMeta([title, "2 pts"])).toBe(`${title}\u00A0· 2\u00A0pts`);
    expect(joinMeta(["Never left the quiz"])).toBe("Never left the quiz");
  });
  it("keeps a zero", () => {
    expect(joinMeta([0, "x"])).toBe("0\u00A0· x");
  });
});
