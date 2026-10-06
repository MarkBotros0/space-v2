import {
  createStudentResponseSchema,
  dateOnlyFromIso,
  enrollmentTransitionResponseSchema,
  graduateStudentRequestSchema,
  graduateStudentResponseSchema,
  isDateOnly,
  isoFromDateOnly,
  studentDeletedResponseSchema,
  updateStudentResponseSchema,
} from "../index";

describe("graduateStudentRequestSchema", () => {
  const thisYear = new Date().getFullYear();

  it("accepts 1990 through the current year, evaluated per call (R58 — v1 captured the year at module load)", () => {
    expect(graduateStudentRequestSchema.safeParse({ graduationYear: 1990 }).success).toBe(true);
    expect(graduateStudentRequestSchema.safeParse({ graduationYear: thisYear }).success).toBe(true);
    expect(graduateStudentRequestSchema.safeParse({ graduationYear: thisYear + 1 }).success).toBe(false);
    expect(graduateStudentRequestSchema.safeParse({ graduationYear: 1989 }).success).toBe(false);
  });

  it("speaks the bound in its message, so the sheet can show it verbatim", () => {
    const res = graduateStudentRequestSchema.safeParse({ graduationYear: 1989 });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe(`Enter a year between 1990 and ${thisYear}.`);
    }
  });

  it("refuses a fractional year and an unknown key", () => {
    expect(graduateStudentRequestSchema.safeParse({ graduationYear: 2020.5 }).success).toBe(false);
    expect(
      graduateStudentRequestSchema.safeParse({ graduationYear: 2020, role: "LEADER" }).success,
    ).toBe(false);
  });
});

describe("lifecycle response schemas (ruling X10 — the client parses, never casts)", () => {
  it("parse the shapes the routes return", () => {
    expect(
      graduateStudentResponseSchema.safeParse({ id: 1, graduationYear: 2020, enrollmentsCompleted: 2 }).success,
    ).toBe(true);
    expect(
      studentDeletedResponseSchema.safeParse({ id: 1, deletedAt: "2099-01-01T00:00:00.000Z" }).success,
    ).toBe(true);
    expect(createStudentResponseSchema.safeParse({ id: 1, email: "a@jpc.test" }).success).toBe(true);
    expect(updateStudentResponseSchema.safeParse({ id: 1 }).success).toBe(true);
    expect(enrollmentTransitionResponseSchema.safeParse({ id: 9, status: "WITHDRAWN" }).success).toBe(true);
    expect(enrollmentTransitionResponseSchema.safeParse({ id: 9, status: "DROPPED" }).success).toBe(false);
  });
});

describe("date-only helpers (Decision 8 — a birthday has no wall clock)", () => {
  it("isDateOnly accepts real YYYY-MM-DD days only", () => {
    expect(isDateOnly("2004-02-29")).toBe(true);
    expect(isDateOnly("2003-02-29")).toBe(false);
    expect(isDateOnly("2004-2-3")).toBe(false);
    expect(isDateOnly("not a date")).toBe(false);
  });

  it("isoFromDateOnly writes UTC midnight", () => {
    expect(isoFromDateOnly("2004-03-09")).toBe("2004-03-09T00:00:00.000Z");
  });

  it("dateOnlyFromIso reads v2's UTC midnight back to the same day", () => {
    expect(dateOnlyFromIso("2004-03-09T00:00:00.000Z")).toBe("2004-03-09");
  });

  it("dateOnlyFromIso recovers v1's browser-local midnights (Cairo winter, Cairo summer, US east)", () => {
    expect(dateOnlyFromIso("2004-03-08T22:00:00.000Z")).toBe("2004-03-09");
    expect(dateOnlyFromIso("2004-07-08T21:00:00.000Z")).toBe("2004-07-09");
    expect(dateOnlyFromIso("2004-03-09T05:00:00.000Z")).toBe("2004-03-09");
  });

  it("dateOnlyFromIso passes null through and refuses garbage", () => {
    expect(dateOnlyFromIso(null)).toBeNull();
    expect(dateOnlyFromIso("nope")).toBeNull();
  });
});
