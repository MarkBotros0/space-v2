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

  it("has no password field at all — D7 is structural, not a default", () => {
    // parse strips unknown keys; the schema must not even know the word.
    expect("password" in createStudentRequestSchema.shape).toBe(false);
    expect("passwordHash" in createStudentRequestSchema.shape).toBe(false);
  });
});

describe("updateStudentRequestSchema (PATCH semantics)", () => {
  it("distinguishes 'clear this field' (null) from 'leave it alone' (absent)", () => {
    const cleared = updateStudentRequestSchema.parse({ gifts: null });
    expect(cleared.gifts).toBeNull();
    const untouched = updateStudentRequestSchema.parse({});
    expect(untouched.gifts).toBeUndefined();
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
    university: null, year: null, gifts: null,
    activeSeasonId: null, activeSeasonTitle: null, activeSeasonCode: null,
  };

  it("REFUSES a payload carrying a withheld field — the leak detector (spec 06 D3)", () => {
    // The public profile is .strict(): a server that leaks `phone` to a
    // LEADER/MENTOR client fails the parse instead of quietly delivering it.
    const leaked = { ...base, profile: { ...publicProfile, phone: "+20 100" } };
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
