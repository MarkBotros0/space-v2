import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import {
  passingPcts,
  weightedScore,
  type PassCriteria,
  type SeasonEndCheck,
} from "../../../../../packages/shared/src/index";
import { createAssignmentWithParts, setSubmitted } from "./assignment-reads-setup";
import { bearer, createTestSeason, createTestUser, tokenFor } from "./fixtures";

/*
 * The End-by-score suites' world: an ACTIVE season with its admin, a leader, two assignments and,
 * unless left out, a PAPER quiz out of 100. Criteria 0 / 50 / 50, mark 60 (sent with End):
 *
 *   high — 2 / 2 assignments, quiz 80 → 90.0
 *   low  — 1 / 2 assignments, quiz 30 → 40.0 (65.0 once their second is marked)
 */

export const app = createApp();
export const CRITERIA: PassCriteria = { weights: { attendance: 0, assignments: 50, quizzes: 50 }, passMark: 60 };

export async function seedEndWorld(opts: { quiz?: boolean; graduatesOnPass?: boolean } = {}) {
  const seasonId = (await createTestSeason()).id;
  if (opts.graduatesOnPass) await db.season.update({ where: { id: seasonId }, data: { graduatesOnPass: true } });
  const [admin, leader, superUser, high, low] = await Promise.all([
    createTestUser("end-pass-admin", "ADMIN"),
    createTestUser("end-pass-leader", "LEADER"),
    createTestUser("end-pass-super", "SUPER"),
    createTestUser("end-pass-high", "STUDENT"),
    createTestUser("end-pass-low", "STUDENT"),
  ]);
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  const group = await db.group.create({
    data: { seasonId, name: "Group", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  await db.seasonEnrollment.createMany({
    data: [high, low].map((s) => ({ seasonId, studentUserId: s.id, groupId: group.id, status: "ACTIVE" as const })),
  });
  const first = await createAssignmentWithParts({ seasonId, title: "First" });
  const second = await createAssignmentWithParts({ seasonId, title: "Second" });
  await setSubmitted(first.id, high.id, new Date());
  await setSubmitted(second.id, high.id, new Date());
  await setSubmitted(first.id, low.id, new Date());
  let quizId: number | null = null;
  if (opts.quiz !== false) {
    quizId = (await db.quiz.create({ data: { seasonId, title: "Paper", kind: "PAPER", maxScore: 100 } })).id;
    await db.quizGrade.createMany({
      data: [
        { quizId, studentUserId: high.id, score: 80 },
        { quizId, studentUserId: low.id, score: 30 },
      ],
    });
  }
  return {
    seasonId,
    groupId: group.id,
    assignments: { first: first.id, second: second.id },
    quizId,
    users: { admin, leader, superUser, high, low },
    tokens: {
      admin: await tokenFor(admin.id),
      leader: await tokenFor(leader.id),
      super: await tokenFor(superUser.id),
    },
  };
}

export type EndWorld = Awaited<ReturnType<typeof seedEndWorld>>;

export const endCheck = async (seasonId: number, token: string): Promise<SeasonEndCheck> => {
  const res = await request(app).get(`/api/v1/seasons/${seasonId}/end-check`).set(bearer(token));
  expect(res.status).toBe(200);
  return res.body.data as SeasonEndCheck;
};

/** What the End screen sends for this check: every score under `criteria`, as shown. */
export function bodyFrom(
  check: SeasonEndCheck,
  criteria: PassCriteria = CRITERIA,
  picks: {
    notPassed?: { userId: number; reason: string | null }[];
    passedNotes?: { userId: number; note: string | null }[];
  } = {},
) {
  return {
    notPassed: picks.notPassed ?? [],
    passedNotes: picks.passedNotes ?? [],
    weights: criteria.weights,
    passMark: criteria.passMark,
    reviewed: {
      graduatesOnPass: check.graduatesOnPass,
      userIds: check.students.map((s) => s.userId),
      scores: check.students.map((s) => ({
        userId: s.userId,
        score: weightedScore(passingPcts(s.numbers), criteria.weights).score,
      })),
    },
  };
}

export const postEnd = (seasonId: number, token: string, body: object) =>
  request(app).post(`/api/v1/seasons/${seasonId}/end`).set(bearer(token)).send(body);

export const enrolmentOf = (seasonId: number, studentUserId: number) =>
  db.seasonEnrollment.findUniqueOrThrow({ where: { studentUserId_seasonId: { studentUserId, seasonId } } });
