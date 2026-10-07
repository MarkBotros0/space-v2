import {
  AT_RISK_PCT,
  createNoteRequestSchema,
  isAtRisk,
  noteVisibilitySchema,
  studentSelfEngagementSchema,
  updateNoteRequestSchema,
} from "../index";

describe("noteVisibilitySchema", () => {
  it("accepts exactly the three enum members the database has", () => {
    expect(noteVisibilitySchema.parse("LEADERS")).toBe("LEADERS");
    expect(noteVisibilitySchema.parse("MENTORS")).toBe("MENTORS");
    expect(noteVisibilitySchema.parse("ADMINS")).toBe("ADMINS");
  });

  it("is NOT derived from the role enum — a new role must never become a visibility", () => {
    expect(noteVisibilitySchema.safeParse("SUPER").success).toBe(false);
    expect(noteVisibilitySchema.safeParse("STUDENT").success).toBe(false);
  });
});

describe("createNoteRequestSchema", () => {
  it("defaults followUpFlagged to false and leaves seasonId absent", () => {
    const parsed = createNoteRequestSchema.parse({ body: "Checked in today.", visibility: "LEADERS" });
    expect(parsed.followUpFlagged).toBe(false);
    expect(parsed.seasonId).toBeUndefined();
  });

  it("refuses a body outside 2..20000", () => {
    expect(createNoteRequestSchema.safeParse({ body: "x", visibility: "LEADERS" }).success).toBe(false);
    expect(
      createNoteRequestSchema.safeParse({ body: "x".repeat(20001), visibility: "LEADERS" }).success,
    ).toBe(false);
  });

  it("has no studentUserId field — the subject is a path parameter, never a body field", () => {
    const parsed = createNoteRequestSchema.parse({
      body: "Checked in today.",
      visibility: "LEADERS",
      studentUserId: 99,
    });
    expect("studentUserId" in parsed).toBe(false);
  });
});

describe("updateNoteRequestSchema", () => {
  it("applies the SAME bound create applies — v1's update validated nothing (R25)", () => {
    expect(updateNoteRequestSchema.safeParse({ body: "" }).success).toBe(false);
    expect(updateNoteRequestSchema.safeParse({ body: "Corrected." }).success).toBe(true);
  });

  it("carries body only — visibility and the flag are immutable after creation (R24)", () => {
    const parsed = updateNoteRequestSchema.parse({ body: "Corrected.", visibility: "ADMINS" });
    expect("visibility" in parsed).toBe(false);
  });
});

describe("isAtRisk — the ONE definition (D7)", () => {
  const base = {
    score: 0,
    attendancePct: 100,
    submissionPct: 100,
    attendanceTotal: 10,
    attendancePresent: 10,
    submissionsExpected: 10,
    submissionsCompleted: 10,
  };

  it("flags a student weak in ONE component, which the composite would hide", () => {
    // 55% attendance, 95% submissions: composite 75 ("Medium" on v1's reports),
    // but this student has stopped turning up. Component-wise catches it.
    expect(
      isAtRisk({ ...base, attendancePct: 55, submissionPct: 95, score: 75 }),
    ).toBe(true);
  });

  it("does not flag a student above the threshold on both components", () => {
    expect(isAtRisk({ ...base, attendancePct: 61, submissionPct: 61, score: 61 })).toBe(false);
  });

  it("never flags on a component with a zero denominator (R56)", () => {
    // A season with no past sessions scored every student 0% attendance in v1
    // and therefore flagged the whole cohort at risk on day one.
    expect(
      isAtRisk({ ...base, attendancePct: 0, attendanceTotal: 0, attendancePresent: 0 }),
    ).toBe(false);
  });

  it("keeps the threshold in one named constant", () => {
    expect(AT_RISK_PCT).toBe(60);
  });
});

describe("studentSelfEngagementSchema", () => {
  it("is strict, so a server leaking the composite to a student fails the parse (D9)", () => {
    const selfPayload = {
      attendancePct: 80,
      submissionPct: 90,
      attendanceTotal: 10,
      attendancePresent: 8,
      submissionsExpected: 10,
      submissionsCompleted: 9,
      seasonId: 7,
      seasonTitle: "Spring 2099",
    };
    expect(studentSelfEngagementSchema.safeParse(selfPayload).success).toBe(true);
    expect(studentSelfEngagementSchema.safeParse({ ...selfPayload, score: 85 }).success).toBe(false);
  });
});
