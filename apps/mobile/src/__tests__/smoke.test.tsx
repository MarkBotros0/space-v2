import { loginRequestSchema } from "@space/shared";

describe("workspace wiring", () => {
  it("resolves shared contracts from the mobile app", () => {
    expect(loginRequestSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });
});
