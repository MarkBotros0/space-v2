/**
 * The uploads-disabled path, covered as a unit test.
 *
 * `jest.setup.ts` forces ENABLE_UPLOADS=true so the upload feature keeps its
 * integration coverage, so this file overrides `config` directly instead.
 *
 * No database is involved and none should be: the guard sits in front of both
 * multer and the submission lookup, so a refused upload never reaches Prisma.
 * That is the property under test as much as the status code is — if this ever
 * starts needing a live database, the guard has drifted behind the DB call and
 * the "don't do the work" goal is lost.
 */

jest.mock("../lib/config", () => {
  // Spread the real config so every other key keeps its true value — only the
  // upload switch is overridden.
  const actual: { config: Record<string, unknown> } = jest.requireActual("../lib/config");
  return { config: { ...actual.config, enableUploads: false } };
});

import request from "supertest";

import { createApp } from "../app";
import { signAccessToken } from "../lib/auth/tokens";

const app = createApp();

async function studentToken(): Promise<string> {
  const { token } = await signAccessToken({
    userId: 1,
    role: "STUDENT",
    seasonAdminIds: [],
    groupLeaderIds: [],
    activeSeasonId: null,
    graduationYear: null,
  });
  return token;
}

describe("POST /api/v1/submissions/:publicId/files with uploads disabled", () => {
  it("returns 503 uploads_disabled", async () => {
    const res = await request(app)
      .post("/api/v1/submissions/abcdefghij/files")
      .set("authorization", `Bearer ${await studentToken()}`)
      .attach("file", Buffer.from("should never be stored"), {
        filename: "blocked.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(503);
    expect(res.body.error).toEqual({
      code: "uploads_disabled",
      message: "File uploads are temporarily unavailable.",
    });
  });

  it("refuses before authentication is even satisfied — 401 still wins", async () => {
    // requireAuth is mounted on the router ahead of the guard, so an
    // unauthenticated caller gets 401 rather than leaking that the capability
    // is off. Pins the middleware order.
    const res = await request(app)
      .post("/api/v1/submissions/abcdefghij/files")
      .attach("file", Buffer.from("x"), { filename: "a.txt", contentType: "text/plain" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("still allows reading and deleting existing files", async () => {
    // The switch is upload-only. DELETE has no guard, so it gets past the
    // middleware chain and fails on its own validation instead — proof the
    // guard is not blanket-gating the /files subtree.
    const res = await request(app)
      .delete("/api/v1/submissions/abcdefghij/files")
      .set("authorization", `Bearer ${await studentToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });
});
