// packages/shared/src/__tests__/video-time.test.ts
import { formatTimestamp, parseTimestamp } from "../index";

describe("formatTimestamp", () => {
  it("emits m:ss below an hour and h:mm:ss at or above one", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(90)).toBe("1:30");
    expect(formatTimestamp(3600)).toBe("1:00:00");
    expect(formatTimestamp(3661)).toBe("1:01:01");
  });

  it("floors fractions and clamps negatives, as v1 did", () => {
    expect(formatTimestamp(90.9)).toBe("1:30");
    expect(formatTimestamp(-5)).toBe("0:00");
  });

  it("does not render 'NaN:NaN' to a student (v1 R20)", () => {
    // v1: Math.floor(NaN) is NaN, Math.max(0, NaN) is NaN, and there is no
    // finiteness guard — so the player's clock read "NaN:NaN" whenever the
    // YouTube API failed to report a duration.
    expect(formatTimestamp(Number.NaN)).toBe("0:00");
    expect(formatTimestamp(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("parseTimestamp", () => {
  it("accepts the three shapes v1 accepted", () => {
    expect(parseTimestamp("90")).toBe(90); // plain seconds, no <60 rule (v1 R26)
    expect(parseTimestamp("1:30")).toBe(90);
    expect(parseTimestamp("1:01:01")).toBe(3661);
    expect(parseTimestamp("  2:00  ")).toBe(120);
  });

  it("rejects empty components instead of reading them as zero (v1 R23)", () => {
    // Number("") is 0, so v1 parsed ":" as 0s, "1:" as 60s, ":30" as 30s,
    // "::" as 0s and "1::" as 3600s. A typo became a valid timestamp.
    for (const input of [":", "1:", ":30", "::", "1::"]) {
      expect(parseTimestamp(input)).toBeNull();
    }
  });

  it("rejects non-decimal numeric literals (v1 R24)", () => {
    // Number() accepts both, so v1 read "0x10" as 16s and "1e3" as 1000s.
    expect(parseTimestamp("0x10")).toBeNull();
    expect(parseTimestamp("1e3")).toBeNull();
    expect(parseTimestamp("1.5")).toBeNull();
    expect(parseTimestamp("-1")).toBeNull();
    expect(parseTimestamp("abc")).toBeNull();
  });

  it("keeps the <60 bounds on trailing components and rejects >3 parts", () => {
    expect(parseTimestamp("1:60")).toBeNull();
    expect(parseTimestamp("1:60:00")).toBeNull();
    expect(parseTimestamp("1:00:60")).toBeNull();
    expect(parseTimestamp("1:1:1:1")).toBeNull();
  });

  it("applies an upper bound where the input is parsed (v1 R27)", () => {
    // v1 had none, so "9999:59" returned 599,999 and the rejection arrived a
    // network round trip later in a different vocabulary.
    expect(parseTimestamp("9999:59")).toBeNull();
    expect(parseTimestamp("100", 60)).toBeNull();
    expect(parseTimestamp("60", 60)).toBe(60);
  });

  it("round-trips everything formatTimestamp emits", () => {
    for (const seconds of [0, 7, 59, 60, 599, 3600, 3661, 86_400]) {
      expect(parseTimestamp(formatTimestamp(seconds))).toBe(seconds);
    }
  });
});
