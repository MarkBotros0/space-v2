// packages/shared/src/__tests__/report-schemas.test.ts
import {
  BAND_ORDER,
  attendancePointSchema,
  assignmentCompletionRowSchema,
  bandFor,
  engagementBandSchema,
  engagementReportRowSchema,
  exportFilename,
  exportFormatSchema,
  organisationReportSchema,
  reportScopeQuerySchema,
} from "../index";

/** A perfect score, cloned and dented per case. */
const perfect = {
  score: 100,
  attendancePct: 100,
  submissionPct: 100,
  attendanceTotal: 10,
  attendancePresent: 10,
  submissionsExpected: 10,
  submissionsCompleted: 10,
};

describe("engagementBandSchema", () => {
  it("has exactly the four bands, as enum members and not display strings", () => {
    expect(engagementBandSchema.parse("AT_RISK")).toBe("AT_RISK");
    // v1 emitted "At risk" — a display string used as a map key, which is why
    // the pie's colours were positional (R30, R92).
    expect(engagementBandSchema.safeParse("At risk").success).toBe(false);
  });

  it("orders the bands High → Medium → Low → At risk, including empty ones", () => {
    expect([...BAND_ORDER]).toEqual(["HIGH", "MEDIUM", "LOW", "AT_RISK"]);
  });
});

describe("bandFor — the at-risk band IS the at-risk list (D-17.2)", () => {
  it("bands a component-weak student AT_RISK even though the composite says Medium", () => {
    // 55% attendance, 95% submissions → composite 75. v1's reports screen
    // called this student "Medium" and listed them nowhere, while the mentor
    // dashboard called them at-risk from the same tab bar (spec D5, R33).
    expect(bandFor({ ...perfect, attendancePct: 55, submissionPct: 95, score: 75 })).toBe(
      "AT_RISK",
    );
  });

  it("bands on the composite once the at-risk test has been passed", () => {
    expect(bandFor({ ...perfect, score: 100 })).toBe("HIGH");
    expect(bandFor({ ...perfect, attendancePct: 70, submissionPct: 70, score: 70 })).toBe(
      "MEDIUM",
    );
    expect(bandFor({ ...perfect, attendancePct: 60, submissionPct: 60, score: 60 })).toBe(
      "MEDIUM",
    );
  });

  it("does not flag a season that has not started yet (zero denominators)", () => {
    // v1 scored a season with no past sessions at 0% attendance and banded the
    // entire cohort "At risk" on day one (R56). Plan 12's guard covers it, and
    // banding must inherit the guard rather than re-testing the percentage.
    expect(
      bandFor({
        score: 0,
        attendancePct: 0,
        submissionPct: 0,
        attendanceTotal: 0,
        attendancePresent: 0,
        submissionsExpected: 0,
        submissionsCompleted: 0,
      }),
    ).toBe("LOW");
  });
});

describe("engagementReportRowSchema", () => {
  it("carries band and NOT a separate atRisk boolean", () => {
    const row = {
      ...perfect,
      studentUserId: 5,
      name: "Test student",
      email: "space-v2-test-a@jpc.test",
      seasonId: 7,
      seasonTitle: "Spring 2099",
      band: "HIGH" as const,
    };
    const parsed = engagementReportRowSchema.parse({ ...row, atRisk: true });
    // Two fields meaning one thing is how this domain got into trouble; the
    // list is `band === "AT_RISK"` and nothing else.
    expect("atRisk" in parsed).toBe(false);
    expect(parsed.band).toBe("HIGH");
  });

  it("requires a name — User.name is NOT NULL (D-17.21)", () => {
    expect(
      engagementReportRowSchema.safeParse({
        ...perfect,
        studentUserId: 5,
        name: null,
        email: "space-v2-test-a@jpc.test",
        seasonId: 7,
        seasonTitle: "Spring 2099",
        band: "HIGH",
      }).success,
    ).toBe(false);
  });
});

describe("attendancePointSchema", () => {
  it("carries the raw instant, both counts, and a nullable pct", () => {
    const point = {
      sessionId: 3,
      seasonId: 7,
      seasonTitle: "Spring 2099",
      title: "Week 1",
      startsAt: "2099-03-01T18:00:00.000Z",
      dayKey: "2099-03-01",
      presentCount: 8,
      expectedCount: 10,
      pct: 80,
    };
    expect(attendancePointSchema.parse(point).startsAt).toBe("2099-03-01T18:00:00.000Z");
    // A session with no roster yet has no percentage. v1 returned 0 (R13),
    // which draws a cliff that never happened.
    expect(
      attendancePointSchema.parse({ ...point, presentCount: 0, expectedCount: 0, pct: null }).pct,
    ).toBeNull();
  });

  it("refuses a pct above 100 — the denominator is the fix, not a clamp (C5)", () => {
    // v1's trend divided a historic session by today's roster and could exceed
    // 100 (R12). If a server ever emits one again, the client must not render it.
    expect(
      attendancePointSchema.safeParse({
        sessionId: 3,
        seasonId: 7,
        seasonTitle: "Spring 2099",
        title: "Week 1",
        startsAt: "2099-03-01T18:00:00.000Z",
        dayKey: "2099-03-01",
        presentCount: 12,
        expectedCount: 10,
        pct: 120,
      }).success,
    ).toBe(false);
  });
});

describe("assignmentCompletionRowSchema", () => {
  it("is named completionRate, not a submission percentage (D-17.1)", () => {
    const row = assignmentCompletionRowSchema.parse({
      assignmentId: 2,
      seasonId: 7,
      title: "Reflection 1",
      targeting: "targeted",
      completed: 4,
      expected: 8,
      completionRate: 50,
    });
    expect(row.completionRate).toBe(50);
    expect("submittedPct" in row).toBe(false);
  });

  it("distinguishes an all-groups assignment from a targeted one", () => {
    expect(assignmentCompletionRowSchema.shape.targeting.parse("all_groups")).toBe("all_groups");
    expect(assignmentCompletionRowSchema.shape.targeting.safeParse("group").success).toBe(false);
  });
});

describe("reportScopeQuerySchema", () => {
  it("accepts a repeated seasonId, a single one, and none", () => {
    // The wire name and the parsed name are both `seasonId` (an array after
    // parse); the routes read `parsed.data.seasonId`.
    expect(reportScopeQuerySchema.parse({ seasonId: ["3", "4"] }).seasonId).toEqual([3, 4]);
    expect(reportScopeQuerySchema.parse({ seasonId: "3" }).seasonId).toEqual([3]);
    // Empty means "my whole permitted scope" — resolved server-side, never
    // "every season in the database" as v1's empty array meant (R1).
    expect(reportScopeQuerySchema.parse({}).seasonId).toEqual([]);
  });

  it("defaults the trend window to 26 points and caps it", () => {
    expect(reportScopeQuerySchema.parse({}).trendLimit).toBe(26);
    expect(reportScopeQuerySchema.safeParse({ trendLimit: "500" }).success).toBe(false);
  });
});

describe("exportFormatSchema and exportFilename", () => {
  it("accepts xlsx only, so ?format=csv is a legible 400 (D-17.7)", () => {
    expect(exportFormatSchema.parse("xlsx")).toBe("xlsx");
    expect(exportFormatSchema.safeParse("csv").success).toBe(false);
  });

  it("builds a filename a human can read in a share sheet (R42)", () => {
    // v1: engagement-1756012800000.csv — no season, no scope, no readable date.
    expect(exportFilename("engagement", "All seasons", "2026-08-24")).toBe(
      "engagement-all-seasons-2026-08-24.xlsx",
    );
    expect(exportFilename("season-workbook", "gbv-2026", "2026-08-24")).toBe(
      "gbv-2026-attendance-grades-2026-08-24.xlsx",
    );
  });

  it("slugs anything a season code or title could contain", () => {
    expect(exportFilename("engagement", 'Winter "24" / أ', "2026-08-24")).toBe(
      "engagement-winter-24-2026-08-24.xlsx",
    );
  });
});

describe("organisationReportSchema", () => {
  it("renames the two fields v1 mislabelled (D4, R54)", () => {
    const parsed = organisationReportSchema.parse({
      totalStudentsNotGraduated: 40,
      totalAlumni: 12,
      activeSeasonCount: 2,
      generatedAt: "2026-08-24T00:00:00.000Z",
      seasons: [
        {
          seasonId: 7,
          code: "gbv-2026",
          program: "GBV",
          year: 2026,
          title: "GBV 2026",
          status: "ACTIVE",
          activeCount: 20,
          completedCount: 3,
          withdrawnCount: 1,
          leaderCount: 2,
        },
      ],
      alumniByYear: [{ year: 2025, count: 12 }],
    });
    // "Current students" counted student ACCOUNTS, including students never
    // enrolled in anything (R51). The field name must not restate the claim.
    expect(parsed.totalStudentsNotGraduated).toBe(40);
    // R62/D13: the row carries `code`, so a screen can navigate by the segment
    // the season route actually resolves.
    expect(parsed.seasons[0]!.code).toBe("gbv-2026");
    expect(parsed.seasons[0]!.withdrawnCount).toBe(1);
  });
});
