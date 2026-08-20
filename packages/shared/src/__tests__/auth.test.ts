import { loginRequestSchema, refreshRequestSchema, loginResponseSchema } from "../auth";

describe("loginRequestSchema", () => {
  it("accepts a valid email and password", () => {
    const result = loginRequestSchema.safeParse({
      email: "student@jpc.test",
      password: "hunter2",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed email", () => {
    const result = loginRequestSchema.safeParse({ email: "not-an-email", password: "hunter2" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = loginRequestSchema.safeParse({ email: "student@jpc.test", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("refreshRequestSchema", () => {
  it("rejects an empty refresh token", () => {
    expect(refreshRequestSchema.safeParse({ refreshToken: "" }).success).toBe(false);
  });
});

describe("loginResponseSchema", () => {
  it("accepts a full session payload", () => {
    const result = loginResponseSchema.safeParse({
      accessToken: "jwt.value.here",
      expiresIn: 900,
      refreshToken: "opaque-refresh",
      user: { id: 1, name: "Sara", email: "sara@jpc.test", role: "STUDENT" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown role", () => {
    const result = loginResponseSchema.safeParse({
      accessToken: "jwt.value.here",
      expiresIn: 900,
      refreshToken: "opaque-refresh",
      user: { id: 1, name: "Sara", email: "sara@jpc.test", role: "WIZARD" },
    });
    expect(result.success).toBe(false);
  });
});
