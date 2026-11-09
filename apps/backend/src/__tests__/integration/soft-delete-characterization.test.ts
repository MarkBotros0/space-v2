/**
 * Characterization test for the refactor (docs/refactor-plan.md, Wave 0).
 *
 * Pins how deleting an account behaves today, end to end, so moving soft
 * delete to one central mechanism (Wave 2) and widening it to more tables
 * (Wave 3) can be checked against it:
 * - the user row stays and gets `deletedAt`; the student profile too;
 * - push devices are hard-deleted; sessions end (refresh and login refused);
 * - the account is listed only under the Super's `inactive` filter;
 * - a Super's reactivate (the restore path) clears both `deletedAt`s.
 */
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { PASSWORD, cleanupTestData, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();
let student: { id: number; email: string };
let superUser: { id: number; email: string };
let superToken: string;

beforeAll(async () => {
  await cleanupTestData();
  student = await createTestUser("soft-delete-student", "STUDENT");
  superUser = await createTestUser("soft-delete-super", "SUPER");
  superToken = await login(app, superUser.email);
  await db.studentProfile.create({ data: { userId: student.id, university: "Test University" } });
  await db.deviceToken.create({
    data: { userId: student.id, token: `space-v2-test-device-${student.id}`, platform: "IOS" },
  });
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

async function listIds(status: string): Promise<number[]> {
  const res = await request(app)
    .get(`/api/v1/users?status=${status}&q=soft-delete-student&limit=100`)
    .set("authorization", `Bearer ${superToken}`);
  expect(res.status).toBe(200);
  return (res.body.data.users as { id: number }[]).map((u) => u.id);
}

describe("deleting your own account (DELETE /api/v1/me)", () => {
  let refreshToken: string;

  it("soft-deletes the user and profile, drops devices and ends sessions", async () => {
    const signIn = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: student.email, password: PASSWORD });
    expect(signIn.status).toBe(200);
    refreshToken = signIn.body.data.refreshToken;
    expect(await listIds("active")).toContain(student.id);

    const res = await request(app)
      .delete("/api/v1/me")
      .set("authorization", `Bearer ${signIn.body.data.accessToken}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.data.deletedAt).toBe("string");

    const user = await db.user.findUnique({ where: { id: student.id } });
    expect(user).not.toBeNull();
    expect(user!.deletedAt).not.toBeNull();
    const profile = await db.studentProfile.findUnique({ where: { userId: student.id } });
    expect(profile!.deletedAt).not.toBeNull();
    expect(await db.deviceToken.count({ where: { userId: student.id } })).toBe(0);
  });

  it("refuses the old refresh token and a new sign-in", async () => {
    const refresh = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(refresh.status).toBe(401);

    const signIn = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: student.email, password: PASSWORD });
    expect(signIn.status).toBe(401);
    expect(signIn.body.error.code).toBe("invalid_credentials");
  });

  it("lists the account as inactive only", async () => {
    expect(await listIds("active")).not.toContain(student.id);
    expect(await listIds("inactive")).toContain(student.id);
  });

  it("is restored by a Super's reactivate", async () => {
    const res = await request(app)
      .post(`/api/v1/users/${student.id}/reactivate`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);

    const user = await db.user.findUnique({ where: { id: student.id } });
    expect(user!.deletedAt).toBeNull();
    const profile = await db.studentProfile.findUnique({ where: { userId: student.id } });
    expect(profile!.deletedAt).toBeNull();
    expect(await listIds("active")).toContain(student.id);
  });
});
