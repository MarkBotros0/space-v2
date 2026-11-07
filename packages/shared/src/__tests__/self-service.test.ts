import {
  attendanceBudgetSchema,
  myProfileSchema,
  parseCheckInCode,
  seasonHistoryRowSchema,
  updateOwnProfileInputSchema,
} from "../index";

describe("parseCheckInCode (Decision 8)", () => {
  it("accepts the bare 10-character token the v2 console's QR encodes", () => {
    expect(parseCheckInCode("AbC123XyZ0")).toBe("AbC123XyZ0");
    expect(parseCheckInCode("  AbC123XyZ0\n")).toBe("AbC123XyZ0");
  });

  it("accepts v1's printed URL form from any host (spec 04 R41)", () => {
    expect(parseCheckInCode("https://space.jpc.example/checkin/AbC123XyZ0")).toBe("AbC123XyZ0");
    expect(parseCheckInCode("http://localhost:3000/checkin/AbC123XyZ0/")).toBe("AbC123XyZ0");
    expect(parseCheckInCode("https://space.jpc.example/checkin/AbC123XyZ0?utm=x")).toBe("AbC123XyZ0");
  });

  it("accepts the app's own deep link", () => {
    expect(parseCheckInCode("spacev2://checkin/AbC123XyZ0")).toBe("AbC123XyZ0");
  });

  it("refuses everything else", () => {
    for (const raw of [
      "",
      "hello",
      "AbC123XyZ",
      "AbC123XyZ01",
      "AbC-23XyZ0",
      "https://x.example/checkin/AbC123XyZ0/extra",
      "https://x.example/other/AbC123XyZ0",
      "javascript:alert(1)",
    ]) {
      expect(parseCheckInCode(raw)).toBeNull();
    }
  });
});

describe("updateOwnProfileInputSchema (Decision 1)", () => {
  it("turns a cleared field into null and leaves absent ones absent (PATCH, v1 R26)", () => {
    expect(updateOwnProfileInputSchema.parse({ phone: "", faculty: "Medicine" })).toEqual({
      phone: null,
      faculty: "Medicine",
    });
  });

  it("takes the university graduation year as a whole year 1950-2100, the future included", () => {
    expect(updateOwnProfileInputSchema.parse({ universityGraduationYear: 2031 })).toEqual({
      universityGraduationYear: 2031,
    });
    expect(updateOwnProfileInputSchema.parse({ universityGraduationYear: null })).toEqual({
      universityGraduationYear: null,
    });
    for (const bad of [1949, 2101, 2030.5, "2030"]) {
      const result = updateOwnProfileInputSchema.safeParse({ universityGraduationYear: bad });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("Use a year between 1950 and 2100.");
      }
    }
  });

  it("refuses the dropped year, spiritual background and gifts fields", () => {
    for (const body of [{ year: "3rd" }, { spiritualBackground: "x" }, { gifts: "x" }]) {
      expect(updateOwnProfileInputSchema.safeParse(body).success).toBe(false);
    }
  });

  it("takes a calendar date and refuses anything that is not a real one", () => {
    expect(updateOwnProfileInputSchema.parse({ dateOfBirth: "2001-04-05" })).toEqual({
      dateOfBirth: "2001-04-05",
    });
    expect(updateOwnProfileInputSchema.parse({ dateOfBirth: "" })).toEqual({ dateOfBirth: null });
    for (const bad of ["05/04/2001", "2001-4-5", "2001-04-05T00:00:00.000Z"]) {
      const result = updateOwnProfileInputSchema.safeParse({ dateOfBirth: bad });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0]?.message).toBe("Use YYYY-MM-DD.");
    }
    // Plan 5's isoDaySchema rejects a well-formed but impossible day with its own message.
    const impossible = updateOwnProfileInputSchema.safeParse({ dateOfBirth: "2001-02-30" });
    expect(impossible.success).toBe(false);
    if (!impossible.success) expect(impossible.error.issues[0]?.message).toBe("Not a real calendar day.");
  });

  it("has no name, email, notes or activeSeasonId — refused, not dropped (R23/R24, spec 18 D2/D8)", () => {
    for (const body of [{ name: "X Y" }, { email: "a@b.test" }, { notes: "x" }, { activeSeasonId: 3 }]) {
      expect(updateOwnProfileInputSchema.safeParse(body).success).toBe(false);
    }
  });

  it("keeps v1's server-side bounds (R20)", () => {
    expect(updateOwnProfileInputSchema.safeParse({ phone: "01012345678" }).success).toBe(true);
    expect(updateOwnProfileInputSchema.safeParse({ phone: "1".repeat(61) }).success).toBe(false);
    expect(updateOwnProfileInputSchema.safeParse({ faculty: "f".repeat(161) }).success).toBe(false);
  });
});

describe("privacy-strict read contracts", () => {
  const profile = {
    name: "Mina Adel",
    email: "mina@jpc.test",
    avatarPath: null,
    graduationYear: null,
    activeSeasonTitle: "GBV 2026",
    university: null,
    faculty: null,
    universityGraduationYear: null,
    phone: null,
    dateOfBirth: "2001-04-05",
  };

  it("myProfileSchema fails loudly if staff-only notes ever reach the subject (R23)", () => {
    expect(myProfileSchema.safeParse(profile).success).toBe(true);
    expect(myProfileSchema.safeParse({ ...profile, notes: "internal" }).success).toBe(false);
  });

  it("seasonHistoryRowSchema fails loudly on any submissions/feedback field (R34)", () => {
    const row = {
      seasonId: 1,
      code: "gbv-2025",
      outcome: "PASSED",
      title: "GBV 2025",
      startDate: "2025-02-01T00:00:00.000Z",
      endDate: "2025-06-30T00:00:00.000Z",
      groupName: null,
      attendancePct: 50,
      curriculum: [],
    };
    expect(seasonHistoryRowSchema.safeParse(row).success).toBe(true);
    expect(seasonHistoryRowSchema.safeParse({ ...row, feedback: "Great" }).success).toBe(false);
  });

  it("attendanceBudgetSchema bounds both percentages to 0–100", () => {
    const budget = { minutesUsed: 105, budgetMinutes: 180, budgetPct: 58, remainingPct: 42, absentCount: 1, lateCount: 1 };
    expect(attendanceBudgetSchema.safeParse(budget).success).toBe(true);
    expect(attendanceBudgetSchema.safeParse({ ...budget, budgetPct: 101 }).success).toBe(false);
    expect(attendanceBudgetSchema.safeParse({ ...budget, remainingPct: -1 }).success).toBe(false);
  });
});
