import {
  acceptInviteRequestSchema,
  acceptInviteResponseSchema,
  activationResponseSchema,
  changePasswordRequestSchema,
  createUserRequestSchema,
  inviteStateSchema,
  meUserSchema,
  passwordSchema,
  updateProfileRequestSchema,
  updateUserRequestSchema,
} from "../index";

describe("passwordSchema — the single definition (spec 11 R65: v1 stated min-8 in four places)", () => {
  it("requires 8 characters and caps at 72 bytes (bcrypt truncation, D8)", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("longenough").success).toBe(true);
    // 24 four-byte emoji = 96 bytes but only 48 UTF-16 code units — the cap
    // must be bytes, or a 96-byte passphrase is silently truncated by bcrypt.
    expect(passwordSchema.safeParse("🐍".repeat(24)).success).toBe(false);
  });
});

describe("createUserRequestSchema", () => {
  const valid = { name: "New Person", email: "p@jpc.test", role: "STUDENT" as const };

  it("defaults graduationYear to null and trims the name", () => {
    const parsed = createUserRequestSchema.parse({ ...valid, name: "  Padded  " });
    expect(parsed.graduationYear).toBeNull();
    expect(parsed.name).toBe("Padded");
  });

  it("enforces the alumni-only rule for LEADER/ADMIN/MENTOR (spec 11 R2/R3)", () => {
    const refused = createUserRequestSchema.safeParse({ ...valid, role: "LEADER" });
    expect(refused.success).toBe(false);
    const ok = createUserRequestSchema.safeParse({ ...valid, role: "LEADER", graduationYear: 2020 });
    expect(ok.success).toBe(true);
  });

  it("evaluates the graduation-year upper bound per call, not at module load (R37)", () => {
    const nextYear = new Date().getFullYear() + 1;
    expect(
      createUserRequestSchema.safeParse({ ...valid, graduationYear: nextYear }).success,
    ).toBe(false);
    expect(
      createUserRequestSchema.safeParse({ ...valid, graduationYear: new Date().getFullYear() }).success,
    ).toBe(true);
  });
});

describe("updateUserRequestSchema", () => {
  it("is a full replace of the three editable fields; email is not among them (R48)", () => {
    expect(
      updateUserRequestSchema.safeParse({ name: "A B", role: "STUDENT", graduationYear: null }).success,
    ).toBe(true);
    // Unknown keys are refused, not stripped: a client sending `email` must
    // hear "no", not have it silently dropped.
    expect(
      updateUserRequestSchema.safeParse({
        name: "A B", role: "STUDENT", graduationYear: null, email: "x@jpc.test",
      }).success,
    ).toBe(false);
  });
});

describe("self-scoped settings schemas", () => {
  it("updateProfileRequestSchema trims before validating (spec 18 R21/D7) and refuses a smuggled subject id", () => {
    expect(updateProfileRequestSchema.parse({ name: "  Bo B  " }).name).toBe("Bo B");
    expect(updateProfileRequestSchema.safeParse({ name: "   a   " }).success).toBe(false);
    // Spec 18 §4: "must reject a body-supplied userId rather than ignoring it".
    expect(updateProfileRequestSchema.safeParse({ name: "Bo B", userId: 7 }).success).toBe(false);
  });

  it("changePasswordRequestSchema carries no `confirm` (client-side rule, spec 18 §7)", () => {
    const ok = changePasswordRequestSchema.safeParse({
      currentPassword: "x", newPassword: "longenough",
    });
    expect(ok.success).toBe(true);
    expect(
      changePasswordRequestSchema.safeParse({
        currentPassword: "x", newPassword: "longenough", confirm: "longenough",
      }).success,
    ).toBe(false);
  });
});

describe("inviteStateSchema", () => {
  it("has no token field, ever (R23, R75)", () => {
    expect(Object.keys(inviteStateSchema.shape).sort()).toEqual([
      "expiresAt", "invitedByName", "issuedAt", "usedAt",
    ]);
  });
});

describe("acceptInviteRequestSchema", () => {
  it("takes a token and the shared password rule", () => {
    expect(acceptInviteRequestSchema.safeParse({ token: "a".repeat(32), password: "longenough" }).success).toBe(true);
    expect(acceptInviteRequestSchema.safeParse({ token: "a".repeat(32), password: "short" }).success).toBe(false);
  });

  it("has a response schema the client parses instead of casting (ruling X10)", () => {
    expect(acceptInviteResponseSchema.safeParse({ ok: true }).success).toBe(true);
    expect(acceptInviteResponseSchema.safeParse({ ok: false }).success).toBe(false);
  });
});

describe("activationResponseSchema", () => {
  it("is the deactivate/reactivate response — deletedAt is a timestamp or null", () => {
    expect(activationResponseSchema.safeParse({ deletedAt: "2026-08-24T00:00:00.000Z" }).success).toBe(true);
    expect(activationResponseSchema.safeParse({ deletedAt: null }).success).toBe(true);
    expect(activationResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe("meUserSchema.hasPassword", () => {
  it("defaults true so a response from a backend that predates the field still parses", () => {
    const parsed = meUserSchema.parse({
      id: 1, name: "N", email: "n@jpc.test", role: "STUDENT", avatarPath: null,
    });
    expect(parsed.hasPassword).toBe(true);
  });
});
