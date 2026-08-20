import { jwtVerify } from "jose";

import { config } from "../lib/config";
import { signAccessToken, verifyAccessToken, type SessionUser } from "../lib/auth/tokens";

const user: SessionUser = {
  userId: 42,
  role: "STUDENT",
  seasonAdminIds: [],
  groupLeaderIds: [7],
  activeSeasonId: 3,
  graduationYear: null,
};

describe("access tokens", () => {
  it("signs with the jpc-mobile audience and a 15 minute ttl", async () => {
    const { token, expiresIn } = await signAccessToken(user);
    expect(expiresIn).toBe(900);

    const { payload } = await jwtVerify(token, new TextEncoder().encode(config.authSecret), {
      audience: "jpc-mobile",
    });
    expect(payload.sub).toBe("42");
    expect(payload.role).toBe("STUDENT");
    expect(payload.groupLeaderIds).toEqual([7]);
    expect(payload.activeSeasonId).toBe(3);
  });

  it("round-trips through verifyAccessToken", async () => {
    const { token } = await signAccessToken(user);
    await expect(verifyAccessToken(token)).resolves.toEqual(user);
  });

  it("returns null for a token signed with a different secret", async () => {
    const { SignJWT } = await import("jose");
    const foreign = await new SignJWT({ role: "STUDENT" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("42")
      .setAudience("jpc-mobile")
      .setExpirationTime("900s")
      .sign(new TextEncoder().encode("a-different-secret"));
    await expect(verifyAccessToken(foreign)).resolves.toBeNull();
  });

  it("returns null for a token with the wrong audience", async () => {
    const { SignJWT } = await import("jose");
    const foreign = await new SignJWT({ role: "STUDENT" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("42")
      .setAudience("some-other-app")
      .setExpirationTime("900s")
      .sign(new TextEncoder().encode(config.authSecret));
    await expect(verifyAccessToken(foreign)).resolves.toBeNull();
  });
});
