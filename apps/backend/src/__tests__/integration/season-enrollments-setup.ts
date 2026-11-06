import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// Shared by the season-enrollments*.test.ts suites. Each calls these from its
// own beforeAll and afterAll.

export const app = createApp();
export const ctx = { superId: 0, superToken: "" };
let n = 0;

type Status = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
export type { Status };

export const nextN = () => ++n;

export async function seedEnrollmentFixtures(): Promise<void> {
  await cleanupTestData();
  const su = await createTestUser("se-super", "SUPER");
  ctx.superId = su.id;
  ctx.superToken = await login(app, su.email);
}

export async function teardownEnrollmentFixtures(): Promise<void> {
  await cleanupTestData();
  await db.$disconnect();
}

export const as = (token: string) => ({ authorization: `Bearer ${token}` });

export const person = async (name: string, graduationYear: number | null = null) => {
  const user = await createTestUser(`se-${++n}`, "STUDENT");
  await db.user.update({ where: { id: user.id }, data: { name, graduationYear } });
  return user;
};
export const season = async (status: Status, title = "Target", requiredProgram: string | null = null, program = "TEST") => {
  const row = await createTestSeason({ status });
  await db.season.update({ where: { id: row.id }, data: { title, program, requiredProgram } });
  return row.id;
};
export const adminTokenOf = async (seasonId: number) => {
  const admin = await person("Season Admin", 2020);
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  return login(app, admin.email);
};
/** A finished GBV season the person ended with `result`. */
export const finishedGbv = async (studentUserId: number, result: "PASSED" | "NOT_PASSED", program = "GBV") => {
  const seasonId = await season("COMPLETED", `${program} 2026`, null, program);
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId, status: "COMPLETED", result, completedAt: new Date(Date.UTC(2026, 5, 1)) },
  });
};
export const leading = async (userId: number, title = "GBV 2026") => {
  const seasonId = await season("ACTIVE", title);
  await db.group.create({ data: { seasonId, name: `Group ${++n}`, leaders: { create: [{ userId }] } } });
};
export const add = (seasonId: number, body: object, token = ctx.superToken) =>
  request(app).post(`/api/v1/seasons/${seasonId}/enrollments`).set(as(token)).send(body);
export const remove = (seasonId: number, userId: number, token = ctx.superToken) =>
  request(app).delete(`/api/v1/seasons/${seasonId}/enrollments/${userId}`).set(as(token));
export const override = (seasonId: number, userId: number, token = ctx.superToken) =>
  request(app).post(`/api/v1/seasons/${seasonId}/enrollments/${userId}/override`).set(as(token));
export const rowOf = (seasonId: number, studentUserId: number) =>
  db.seasonEnrollment.findUnique({ where: { studentUserId_seasonId: { studentUserId, seasonId } } });
export const rowsIn = (seasonId: number) => db.seasonEnrollment.count({ where: { seasonId } });
export const stamp = async (id: number) =>
  (await db.user.findUniqueOrThrow({ where: { id }, select: { sessionsValidFrom: true } })).sessionsValidFrom;
