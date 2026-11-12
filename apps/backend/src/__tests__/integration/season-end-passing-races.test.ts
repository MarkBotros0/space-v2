import { db } from "../../db/client";
import { ensurePartWork, lockAssignmentForWork } from "../../lib/assignments/essay";
import { lockStudentInQuiz } from "../../lib/quizzes/student-lock";
import { createAssignmentWithParts } from "./assignment-reads-setup";
import { cleanupTestData } from "./fixtures";
import { behind, holdTransaction } from "./lock-holds";
import { bodyFrom, endCheck, enrolmentOf, postEnd, seedEndWorld } from "./season-end-passing-setup";

/*
 * End recomputes the scores inside its transaction, after it holds the season and its people
 * (Season FOR NO KEY UPDATE, then every person FOR UPDATE). A student's own write holds their User
 * row (a quiz's FOR NO KEY UPDATE, or an insert's foreign key check, FOR KEY SHARE) and nothing End
 * holds, so End waits for it and never the other way round: no cycle. The numbers are read after
 * the people's locks, so a write End waited for is in the score it compares.
 */
jest.setTimeout(90000);

beforeEach(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("End against a student's own write", () => {
  it("waits for a quiz write holding the student, then refuses the score it changed", async () => {
    const w = await seedEndWorld();
    const quiz = await db.quiz.create({ data: { seasonId: w.seasonId, title: "Late", kind: "PAPER", maxScore: 10 } });
    const quizId = quiz.id;
    // The preview the admin saw: the late quiz at 0 of 10 for both.
    const shown = await endCheck(w.seasonId, w.tokens.admin);

    const held = await holdTransaction(
      (tx) => lockStudentInQuiz(tx, quizId, w.users.low.id),
      (tx) => tx.quizGrade.create({ data: { quizId, studentUserId: w.users.low.id, score: 10 } }),
    );
    const res = await behind(held, () => postEnd(w.seasonId, w.tokens.admin, bodyFrom(shown)));

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe("The scores changed; check the season again.");
    expect((await db.season.findUniqueOrThrow({ where: { id: w.seasonId } })).status).toBe("ACTIVE");
    expect(await enrolmentOf(w.seasonId, w.users.low.id)).toMatchObject({ status: "ACTIVE", passScore: null });
  });

  it("waits for a student's first essay save and ends once it lands", async () => {
    const w = await seedEndWorld();
    const essay = await createAssignmentWithParts({ seasonId: w.seasonId, title: "Third" });
    const shown = await endCheck(w.seasonId, w.tokens.admin);

    // The student's first save, held open: their Submission and work row point at their User, so
    // the transaction holds it FOR KEY SHARE, which End's FOR UPDATE on the people waits for.
    const held = await holdTransaction(async (tx) => {
      await lockAssignmentForWork(tx, essay.id);
      await ensurePartWork(tx, essay.id, essay.partIds[0]!, w.users.high.id);
    });
    const res = await behind(held, () => postEnd(w.seasonId, w.tokens.admin, bodyFrom(shown)));

    expect(res.status).toBe(200);
    const h = await enrolmentOf(w.seasonId, w.users.high.id);
    expect(h).toMatchObject({ status: "COMPLETED", result: "PASSED" });
    expect(await db.assignmentPartWork.count({ where: { studentUserId: w.users.high.id } })).toBe(1);
  });
});
