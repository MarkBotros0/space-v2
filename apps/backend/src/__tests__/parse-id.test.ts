import { parseId } from "../lib/parse-id";

describe("parseId", () => {
  it("accepts a positive integer string", () => {
    expect(parseId("7")).toBe(7);
  });

  it("rejects zero and negatives", () => {
    expect(parseId("0")).toBeNull();
    expect(parseId("-1")).toBeNull();
  });

  it("rejects non-numeric and fractional input", () => {
    expect(parseId("abc")).toBeNull();
    expect(parseId("1.5")).toBeNull();
  });

  it("rejects undefined and the empty string", () => {
    expect(parseId(undefined)).toBeNull();
    // Number("") is 0, which the positivity check rejects — asserted so a
    // future refactor cannot regress it into returning 0.
    expect(parseId("")).toBeNull();
  });
});
