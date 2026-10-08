import { lateBasisForSave } from "../lib/late-basis";

const entry = (status: "PRESENT" | "ABSENT" | "LATE", lateMinutes?: number) => ({ status, lateMinutes });

describe("lateBasisForSave (M3)", () => {
  it("labels a brand-new row MANUAL whatever it holds", () => {
    expect(lateBasisForSave(null, entry("LATE", 5))).toBe("MANUAL");
    expect(lateBasisForSave(null, entry("PRESENT"))).toBe("MANUAL");
  });

  describe("on a checked-in row", () => {
    const existing = { checkedInAt: new Date(), lateMinutes: 7 };
    it("keeps its basis when the minutes come back unchanged", () => {
      expect(lateBasisForSave(existing, entry("LATE", 7))).toBeUndefined();
    });
    it("flips to MANUAL when the leader typed a different number", () => {
      expect(lateBasisForSave(existing, entry("LATE", 9))).toBe("MANUAL");
    });
    it("keeps its basis when the status stops being LATE", () => {
      expect(lateBasisForSave(existing, entry("PRESENT"))).toBeUndefined();
      expect(lateBasisForSave(existing, entry("ABSENT"))).toBeUndefined();
    });
  });

  describe("on a row nobody scanned", () => {
    const existing = { checkedInAt: null, lateMinutes: 7 };
    it("is MANUAL whether or not minutes are supplied", () => {
      expect(lateBasisForSave(existing, entry("LATE", 7))).toBe("MANUAL");
      expect(lateBasisForSave(existing, entry("PRESENT"))).toBe("MANUAL");
    });
  });
});
