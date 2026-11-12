import { db } from "../../db/client";
import { createAssignmentWithParts, seedTextWork, setSubmitted } from "./assignment-reads-setup";
import { createTestSeason, createTestUser, tokenFor } from "./fixtures";

/*
 * One season for the passing reads (outlook, a student's progress, the list's numbers): two
 * assignments, one PAPER quiz out of 100 that counts, and an unpublished ONLINE quiz with a
 * question that must never reach a response. Criteria 0 / 50 / 50, mark 60, written straight to
 * the row (the PUT is Task 2's suite).
 *
 *   on track  — group A, 2 / 2 assignments, quiz 70 → 85.0
 *   short     — group A, 2 / 2 assignments, quiz 4  → 52.0 (8 points short, weakest quizzes)
 *   middle    — group B, 1 / 2 assignments, quiz 60 → 55.0 (5 points short, weakest assignments)
 *   withdrawn — group A, WITHDRAWN: on no roster
 */

export const SECRET_PROMPT = "space-v2-test secret question prompt";
export const SECRET_ESSAY = "space-v2-test secret essay answer";

export async function seedPassingWorld() {
  const seasonId = (await createTestSeason()).id;
  const otherSeasonId = (await createTestSeason()).id;
  const [admin, superUser, leaderA, leaderB, mentor, otherAdmin, onTrack, short, middle, withdrawn] = await Promise.all(
    [
      createTestUser("pass-admin", "ADMIN"),
      createTestUser("pass-super", "SUPER"),
      createTestUser("pass-leader-a", "LEADER"),
      createTestUser("pass-leader-b", "LEADER"),
      createTestUser("pass-mentor", "MENTOR"),
      createTestUser("pass-other-admin", "ADMIN"),
      createTestUser("pass-on-track", "STUDENT"),
      createTestUser("pass-short", "STUDENT"),
      createTestUser("pass-middle", "STUDENT"),
      createTestUser("pass-withdrawn", "STUDENT"),
    ],
  );
  await db.seasonAdmin.createMany({
    data: [
      { seasonId, userId: admin.id },
      { seasonId: otherSeasonId, userId: otherAdmin.id },
    ],
  });
  const groupA = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leaderA.id } } },
    select: { id: true },
  });
  const groupB = await db.group.create({
    data: { seasonId, name: "Group B", leaders: { create: { userId: leaderB.id } } },
    select: { id: true },
  });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: onTrack.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: short.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: middle.id, groupId: groupB.id, status: "ACTIVE" },
      { seasonId, studentUserId: withdrawn.id, groupId: groupA.id, status: "WITHDRAWN" },
    ],
  });
  await db.season.update({
    where: { id: seasonId },
    data: {
      passWeightAttendance: 0,
      passWeightAssignments: 50,
      passWeightQuizzes: 50,
      passMark: 60,
      passCriteriaSetAt: new Date(),
    },
  });

  const first = await createAssignmentWithParts({ seasonId, title: "First", dueAt: new Date("2099-02-01") });
  const second = await createAssignmentWithParts({ seasonId, title: "Second", dueAt: new Date("2099-03-01") });
  for (const s of [onTrack, short]) {
    await setSubmitted(first.id, s.id, new Date());
    await setSubmitted(second.id, s.id, new Date());
  }
  await seedTextWork(first.id, first.partIds[0]!, middle.id, "SUBMITTED", { text: SECRET_ESSAY });
  await setSubmitted(first.id, middle.id, new Date());

  const paper = await db.quiz.create({
    data: { seasonId, title: "Paper", kind: "PAPER", maxScore: 100 },
    select: { id: true },
  });
  await db.quizGrade.createMany({
    data: [
      { quizId: paper.id, studentUserId: onTrack.id, score: 70 },
      { quizId: paper.id, studentUserId: short.id, score: 4 },
      { quizId: paper.id, studentUserId: middle.id, score: 60 },
    ],
  });
  const hidden = await db.quiz.create({
    data: { seasonId, title: "Draft online", kind: "ONLINE", maxScore: 5, publishedAt: null },
    select: { id: true },
  });
  await db.quizQuestion.create({
    data: { quizId: hidden.id, order: 1, type: "ESSAY", prompt: SECRET_PROMPT, points: 5, options: [] },
  });

  return {
    seasonId,
    otherSeasonId,
    groupA: groupA.id,
    groupB: groupB.id,
    assignments: { first: first.id, second: second.id },
    quizzes: { paper: paper.id },
    users: { admin, superUser, leaderA, leaderB, mentor, otherAdmin, onTrack, short, middle, withdrawn },
    tokens: {
      admin: await tokenFor(admin.id),
      super: await tokenFor(superUser.id),
      leaderA: await tokenFor(leaderA.id),
      leaderB: await tokenFor(leaderB.id),
      mentor: await tokenFor(mentor.id),
      otherAdmin: await tokenFor(otherAdmin.id),
      student: await tokenFor(middle.id),
    },
  };
}

export type PassingWorld = Awaited<ReturnType<typeof seedPassingWorld>>;
