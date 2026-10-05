import {
  createSessionRequestSchema,
  deleteSessionRequestSchema,
  duplicateSeasonRequestSchema,
  isValidSeasonCode,
  seasonAdminPatchSchema,
  seasonWriteRequestSchema,
  slugifySeasonCode,
  updateSessionRequestSchema,
} from "../index";

describe("slugifySeasonCode (v1 src/lib/slug.ts, verbatim)", () => {
  it("lowercases, strips diacritics, dashes runs, trims and collapses", () => {
    expect(slugifySeasonCode("Été  2099")).toBe("ete-2099");
    expect(slugifySeasonCode("--GBV // Spring--")).toBe("gbv-spring");
  });
});

describe("isValidSeasonCode", () => {
  it("enforces v1's format and 2–40 length on the slug", () => {
    expect(isValidSeasonCode("gbv-2099")).toBe(true);
    expect(isValidSeasonCode("a")).toBe(false);
    expect(isValidSeasonCode("a".repeat(41))).toBe(false);
    expect(isValidSeasonCode("-gbv")).toBe(false);
  });
});

describe("seasonWriteRequestSchema", () => {
  const valid = {
    code: "Test 2099", program: "TEST", year: 2099,
    startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
    status: "DRAFT",
  };

  it("slugifies the code before validating it, as v1 did", () => {
    expect(seasonWriteRequestSchema.parse(valid).code).toBe("test-2099");
  });

  it("defaults the code to '<program> <year>' when absent or empty (v1 R2)", () => {
    const { code: _omit, ...noCode } = valid;
    expect(seasonWriteRequestSchema.parse(noCode).code).toBe("test-2099");
    expect(seasonWriteRequestSchema.parse({ ...valid, code: "" }).code).toBe("test-2099");
  });

  it("applies the 40-char bound to the slug, not the raw input", () => {
    expect(seasonWriteRequestSchema.safeParse({ ...valid, code: "x".repeat(41) }).success).toBe(false);
  });

  it("defaults the absence budget fields v1's create silently discarded", () => {
    const parsed = seasonWriteRequestSchema.parse(valid);
    expect(parsed.absenceBudgetMinutes).toBe(180);
    expect(parsed.absenceWeightMinutes).toBe(90);
  });

  it("refuses an end date before the start date", () => {
    expect(
      seasonWriteRequestSchema.safeParse({ ...valid, endDate: "2098-01-01T00:00:00.000Z" }).success,
    ).toBe(false);
  });
});

describe("seasonAdminPatchSchema", () => {
  it("accepts only the D3 allowlist", () => {
    expect(seasonAdminPatchSchema.safeParse({ description: "x", absenceBudgetMinutes: 200 }).success).toBe(true);
    expect(seasonAdminPatchSchema.safeParse({ status: "ARCHIVED" }).success).toBe(false);
  });
});

describe("session write schemas", () => {
  const valid = {
    title: "Session one", startsAt: "2099-03-01T18:00:00.000Z", durationMinutes: 90,
  };

  it("bounds title at the server truth (2–120), not the client's old limit", () => {
    // Spec 03 §10 item 7: v1's client and server disagreed; the server wins.
    expect(createSessionRequestSchema.safeParse({ ...valid, seasonId: 1, title: "x" }).success).toBe(false);
    expect(
      createSessionRequestSchema.safeParse({ ...valid, seasonId: 1, title: "ab" }).success,
    ).toBe(true);
  });

  it("refuses repeatWeeks outside 1..26 (v1 clamped silently)", () => {
    expect(
      createSessionRequestSchema.safeParse({ ...valid, seasonId: 1, repeatWeeks: 27 }).success,
    ).toBe(false);
  });

  it("requires a scope on update", () => {
    expect(updateSessionRequestSchema.safeParse(valid).success).toBe(false);
    expect(updateSessionRequestSchema.safeParse({ ...valid, scope: "future" }).success).toBe(true);
  });

  it("defaults delete to scope one, no force", () => {
    expect(deleteSessionRequestSchema.parse({})).toEqual({ scope: "one", force: false });
  });
});

describe("duplicateSeasonRequestSchema", () => {
  it("refuses endDate before startDate", () => {
    expect(
      duplicateSeasonRequestSchema.safeParse({
        year: 2100, startDate: "2100-06-01T00:00:00.000Z", endDate: "2100-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
