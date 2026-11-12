import request from "supertest";

import { db } from "../../db/client";
import { loadScopes } from "../../lib/auth/scopes";
import { signAccessToken } from "../../lib/auth/tokens";
import { createTestSeason, endBodyOf, type reviewedOf } from "./fixtures";
import { app, as, ctx } from "./season-enrollments-setup";

// Shared by the graduating-seasons*.test.ts suites.

export const THIS_YEAR = Number(
  new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", year: "numeric" }).format(new Date()),
);

export const seasonOf = async (
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED",
  graduatesOnPass: boolean,
  endDate?: Date,
  year = THIS_YEAR,
) => {
  const row = await createTestSeason({ status, year });
  // A season ends on or after it starts (Season_endDate_check), so a given end moves the start a month before it.
  const dates = endDate ? { startDate: new Date(endDate.getTime() - 30 * 86_400_000), endDate } : {};
  await db.season.update({ where: { id: row.id }, data: { graduatesOnPass, ...dates } });
  return row.id;
};
export const enrol = (seasonId: number, studentUserId: number, status: "ACTIVE" | "WITHDRAWN" = "ACTIVE") =>
  db.seasonEnrollment.create({ data: { seasonId, studentUserId, status } });
export const finished = (seasonId: number, studentUserId: number, result: "PASSED" | "NOT_PASSED" | null) =>
  db.seasonEnrollment.create({
    data: { seasonId, studentUserId, status: "COMPLETED", result, completedAt: new Date(Date.UTC(2026, 5, 1)) },
  });
export const yearOf = async (id: number) =>
  (await db.user.findUniqueOrThrow({ where: { id }, select: { graduationYear: true } })).graduationYear;
export const end = async (
  seasonId: number,
  notPassed: { userId: number; reason: string | null }[] = [],
  token = ctx.superToken,
  /** What the staff member was shown; by default the season as it is now. */
  reviewed?: Awaited<ReturnType<typeof reviewedOf>>,
) =>
  request(app)
    .post(`/api/v1/seasons/${seasonId}/end`)
    .set(as(token))
    .send(await endBodyOf(seasonId, notPassed, reviewed));
export const correct = (seasonId: number, userId: number, result: "PASSED" | "NOT_PASSED") =>
  request(app)
    .patch(`/api/v1/seasons/${seasonId}/results/${userId}`)
    .set(as(ctx.superToken))
    .send({ result, reason: null });
export const graduate = (userId: number, body: object, token = ctx.superToken) =>
  request(app).post(`/api/v1/students/${userId}/graduate`).set(as(token)).send(body);
export const nextSecond = () => new Promise((resolve) => setTimeout(resolve, 1100));
/** Minted, not signed in: the login limiter would throttle a fixture per test. */
export const mint = async (userId: number) => (await signAccessToken({ userId, ...(await loadScopes(userId)) })).token;
export const auditLines = async (run: () => Promise<unknown>) => {
  const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
  await run();
  const lines = info.mock.calls.map((c) => String(c[0]));
  info.mockRestore();
  return lines;
};
