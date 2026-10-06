import {
  PASSWORD_RESET_TTL_MINUTES,
  extractResetToken,
  forgotPasswordRequestSchema,
  passwordResetAckSchema,
  resetPasswordRequestSchema,
} from "../index";

const TOKEN = "ab".repeat(32); // v1's format: 32 random bytes as 64 hex chars (R71)

describe("forgotPasswordRequestSchema", () => {
  it("trims, requires an email, and refuses anything else in the body", () => {
    expect(forgotPasswordRequestSchema.parse({ email: "  a@jpc.test " }).email).toBe("a@jpc.test");
    expect(forgotPasswordRequestSchema.safeParse({ email: "nope" }).success).toBe(false);
    expect(forgotPasswordRequestSchema.safeParse({ email: "a@jpc.test", userId: 1 }).success).toBe(false);
  });
});

describe("resetPasswordRequestSchema", () => {
  it("takes a token and the ONE shared password policy (spec 11 R65)", () => {
    expect(resetPasswordRequestSchema.safeParse({ token: TOKEN, password: "longenough" }).success).toBe(true);
    expect(resetPasswordRequestSchema.safeParse({ token: TOKEN, password: "short" }).success).toBe(false);
    expect(resetPasswordRequestSchema.safeParse({ token: "tiny", password: "longenough" }).success).toBe(false);
  });
});

describe("extractResetToken", () => {
  it("returns a bare code unchanged, trimmed", () => {
    expect(extractResetToken(`  ${TOKEN}\n`)).toBe(TOKEN);
  });

  it("pulls the token out of a pasted v1 web link (Decision 10 — v1 emails stay usable by paste)", () => {
    expect(extractResetToken(`https://space.example.org/reset-password?token=${TOKEN}`)).toBe(TOKEN);
  });

  it("pulls it out of v2's app link and decodes percent-encoding", () => {
    expect(extractResetToken(`spacev2://reset-password?token=${TOKEN}&x=1`)).toBe(TOKEN);
    expect(extractResetToken("spacev2://reset-password?token=a%2Bb")).toBe("a+b");
  });
});

describe("passwordResetAckSchema / TTL", () => {
  it("is the constant acknowledgement both endpoints return", () => {
    expect(passwordResetAckSchema.safeParse({ ok: true }).success).toBe(true);
    expect(passwordResetAckSchema.safeParse({ ok: false }).success).toBe(false);
  });

  it("states v1's 1-hour TTL (R73) in one place the screens can quote", () => {
    expect(PASSWORD_RESET_TTL_MINUTES).toBe(60);
  });
});
