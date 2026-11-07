import {
  createStudentRequestSchema,
  studentDetailPublicSchema,
  studentListQuerySchema,
  updateEnrollmentRequestSchema,
  updateStudentRequestSchema,
} from "../index";

describe("createStudentRequestSchema", () => {
  const valid = { name: "Test Student", email: "space-v2-test-x@jpc.test" };

  it("coerces empty strings to null (v1 rule R26: a cleared field is stored null, never \"\")", () => {
    const parsed = createStudentRequestSchema.parse({ ...valid, university: "" });
    expect(parsed.university).toBeNull();
  });

  it("bounds name at 2–120 like v1's server schema (R20)", () => {
    expect(createStudentRequestSchema.safeParse({ ...valid, name: "x" }).success).toBe(false);
  });

  it("trims and lowercases the email, as the importer does", () => {
    const parsed = createStudentRequestSchema.parse({ ...valid, email: "  Space-V2-Test-X@JPC.test " });
    expect(parsed.email).toBe("space-v2-test-x@jpc.test");
  });

  it("has no password field at all — D7 is structural, not a default", () => {
    // parse strips unknown keys; the schema must not even know the word.
    expect("password" in createStudentRequestSchema.shape).toBe(false);
    expect("passwordHash" in createStudentRequestSchema.shape).toBe(false);
  });
});

describe("updateStudentRequestSchema (PATCH semantics)", () => {
  it("distinguishes 'clear this field' (null) from 'leave it alone' (absent)", () => {
    const cleared = updateStudentRequestSchema.parse({ faculty: null });
    expect(cleared.faculty).toBeNull();
    const untouched = updateStudentRequestSchema.parse({});
    expect(untouched.faculty).toBeUndefined();
  });

  it("takes the university graduation year as a whole year in 1950-2100, future included", () => {
    expect(updateStudentRequestSchema.parse({ universityGraduationYear: 2031 }).universityGraduationYear).toBe(2031);
    expect(updateStudentRequestSchema.parse({ universityGraduationYear: null }).universityGraduationYear).toBeNull();
    for (const bad of [1949, 2101, 2027.5, "2027"]) {
      expect(updateStudentRequestSchema.safeParse({ universityGraduationYear: bad }).success).toBe(false);
    }
  });

  it("trims and lowercases an edited email", () => {
    expect(updateStudentRequestSchema.parse({ email: " A@JPC.test" }).email).toBe("a@jpc.test");
  });

  it("still coerces empty string to null on the fields it does receive", () => {
    expect(updateStudentRequestSchema.parse({ phone: "" }).phone).toBeNull();
  });
});

describe("studentDetailPublicSchema", () => {
  const base = {
    id: 1, name: "Test", email: "t@jpc.test", avatarPath: null, graduationYear: null,
    currentGroup: null, enrollments: [],
  };
  const publicProfile = {
    university: null, faculty: null, universityGraduationYear: null,
    activeSeasonId: null, activeSeasonTitle: null, activeSeasonCode: null,
    // Leaders and mentors see the phone (owner, 2026-11-07).
    phone: "01001234567",
  };

  it("REFUSES a payload carrying a withheld field — the leak detector (spec 06 D3)", () => {
    // The public profile is .strict(): a server that leaks the date of birth to a
    // LEADER/MENTOR client fails the parse instead of quietly delivering it.
    const leaked = { ...base, profile: { ...publicProfile, dateOfBirth: "2000-01-01" } };
    expect(studentDetailPublicSchema.safeParse(leaked).success).toBe(false);
    expect(studentDetailPublicSchema.safeParse({ ...base, profile: publicProfile }).success).toBe(true);
  });
});

describe("studentListQuerySchema", () => {
  it("defaults to the active list with a 25-row page", () => {
    const parsed = studentListQuerySchema.parse({});
    expect(parsed).toMatchObject({ status: "active", limit: 25 });
  });

  it("coerces the string query params HTTP delivers", () => {
    const parsed = studentListQuerySchema.parse({ cursor: "42", limit: "10", seasonId: "7" });
    expect(parsed).toMatchObject({ cursor: 42, limit: 10, seasonId: 7 });
  });
});

describe("updateEnrollmentRequestSchema", () => {
  it("accepts only the two terminal transitions — re-activation does not exist (R50)", () => {
    expect(updateEnrollmentRequestSchema.safeParse({ status: "ACTIVE" }).success).toBe(false);
    expect(updateEnrollmentRequestSchema.safeParse({ status: "WITHDRAWN" }).success).toBe(true);
  });

  it("refuses a dropReason on a COMPLETED transition", () => {
    expect(
      updateEnrollmentRequestSchema.safeParse({ status: "COMPLETED", dropReason: "why" }).success,
    ).toBe(false);
  });

  it("stores an empty reason as null (R66)", () => {
    expect(
      updateEnrollmentRequestSchema.parse({ status: "WITHDRAWN", dropReason: "" }).dropReason,
    ).toBeNull();
  });
});
