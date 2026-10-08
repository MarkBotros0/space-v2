import { addYearsIso, autoSeasonCode } from "../lib/season-defaults";

describe("autoSeasonCode", () => {
  it("slugifies program and year, and waits for both", () => {
    expect(autoSeasonCode("Spring GBV", "2027")).toBe("spring-gbv-2027");
    expect(autoSeasonCode("Spring", "")).toBe("");
    expect(autoSeasonCode("", "2027")).toBe("");
  });
});

describe("addYearsIso", () => {
  it("shifts a date one year and clamps 29 Feb", () => {
    expect(addYearsIso("2026-01-05T00:00:00.000Z", 1)).toBe("2027-01-05T00:00:00.000Z");
    expect(addYearsIso("2024-02-29T00:00:00.000Z", 1)).toBe("2025-02-28T00:00:00.000Z");
    expect(addYearsIso("nope", 1)).toBe("nope");
  });
});
