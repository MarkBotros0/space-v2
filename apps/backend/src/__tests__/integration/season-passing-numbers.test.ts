import { db } from "../../db/client";
import { loadPassingNumbers } from "../../lib/passing/numbers";
import { createAssignmentWithParts, setSubmitted } from "./assignment-reads-setup";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

jest.setTimeout(60000);

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const at = (days: number) => new Date(now.getTime() + days * DAY);

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

async function session(seasonId: number, title: string, startsAt: Date) {
  return db.session.create({ data: { seasonId, title, startsAt }, select: { id: true } });
}

async function quiz(
  seasonId: number,
  data: { title: string; kind: "PAPER" | "ONLINE"; maxScore: number; publishedAt?: Date | null },
) {
  return db.quiz.create({ data: { seasonId, ...data }, select: { id: true } });
}

async function attempt(
  quizId: number,
  studentUserId: number,
  attemptNumber: number,
  status: "GRADED" | "SUBMITTED",
  totalScore: number,
) {
  await db.quizAttempt.create({
    data: { quizId, studentUserId, attemptNumber, status, totalScore, autoScore: totalScore, shuffleSeed: 1 },
  });
}

async function staffMark(assignmentId: number, studentUserId: number, markedById: number) {
  const s = await setSubmitted(assignmentId, studentUserId, null);
  await db.submissionStaffMark.create({ data: { submissionId: s.id, markedById } });
}

describe("loadPassingNumbers", () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  it("numbers follow the one definition", async () => {
    const seasonId = (await createTestSeason()).id;
    const [early, late, admin] = await Promise.all([
      createTestUser("pass-early", "STUDENT"),
      createTestUser("pass-late", "STUDENT"),
      createTestUser("pass-admin", "ADMIN"),
    ]);
    await db.seasonEnrollment.createMany({
      data: [
        { seasonId, studentUserId: early.id, status: "ACTIVE", enrolledAt: at(-30) },
        { seasonId, studentUserId: late.id, status: "ACTIVE", enrolledAt: at(-7) },
      ],
    });

    // Attendance: three past sessions (the first before the late joiner came), one in the future.
    const s1 = await session(seasonId, "Before the late joiner", at(-10));
    const s2 = await session(seasonId, "Second", at(-5));
    const s3 = await session(seasonId, "Third", at(-2));
    const s4 = await session(seasonId, "Next week", at(5));
    await db.attendance.createMany({
      data: [
        { sessionId: s1.id, studentUserId: early.id, status: "PRESENT" },
        { sessionId: s2.id, studentUserId: early.id, status: "LATE" },
        { sessionId: s3.id, studentUserId: early.id, status: "ABSENT" },
        { sessionId: s1.id, studentUserId: late.id, status: "PRESENT" },
        { sessionId: s2.id, studentUserId: late.id, status: "PRESENT" },
        { sessionId: s4.id, studentUserId: late.id, status: "PRESENT" },
      ],
    });

    // Assignments: one submitted in the app, one marked by staff.
    const a1 = await createAssignmentWithParts({ seasonId, title: "In the app" });
    const a2 = await createAssignmentWithParts({ seasonId, title: "Marked" });
    await setSubmitted(a1.id, early.id, at(-1));
    await staffMark(a2.id, early.id, admin.id);

    // Quizzes.
    const paper = await quiz(seasonId, { title: "Paper", kind: "PAPER", maxScore: 10 });
    const online = await quiz(seasonId, { title: "Online", kind: "ONLINE", maxScore: 20, publishedAt: at(-3) });
    const draft = await quiz(seasonId, { title: "Draft", kind: "ONLINE", maxScore: 50, publishedAt: null });
    const notTaken = await quiz(seasonId, { title: "Not taken", kind: "PAPER", maxScore: 5 });
    await db.quizGrade.createMany({
      data: [
        { quizId: paper.id, studentUserId: early.id, score: 7.5 },
        { quizId: paper.id, studentUserId: late.id, score: null }, // ungraded paper row
        { quizId: online.id, studentUserId: early.id, score: 12 }, // the admin's score
        { quizId: notTaken.id, studentUserId: late.id, score: 5 },
      ],
    });
    await attempt(online.id, early.id, 1, "GRADED", 18); // higher, but the admin's score counts
    await attempt(online.id, late.id, 1, "SUBMITTED", 15); // waiting for marking: 0
    await attempt(draft.id, early.id, 1, "GRADED", 50); // an unpublished quiz is left out

    const { available, numbers } = await loadPassingNumbers(seasonId, null, db, now);

    expect(available).toEqual({ attendance: true, assignments: true, quizzes: true });
    expect(numbers.get(early.id)).toEqual({
      attendance: { attended: 2, total: 3 },
      assignments: { submitted: 2, total: 2 },
      quizzes: { scored: 19.5, max: 35 },
    });
    expect(numbers.get(late.id)).toEqual({
      attendance: { attended: 1, total: 2 },
      assignments: { submitted: 0, total: 2 },
      quizzes: { scored: 5, max: 35 },
    });

    // Asked for one student: only that one.
    const one = await loadPassingNumbers(seasonId, [late.id], db, now);
    expect([...one.numbers.keys()]).toEqual([late.id]);
    expect(one.numbers.get(late.id)).toEqual(numbers.get(late.id));
  });

  it("a deleted assignment or student is left out", async () => {
    const seasonId = (await createTestSeason()).id;
    const [kept, deleted, withdrawn] = await Promise.all([
      createTestUser("pass-kept", "STUDENT"),
      createTestUser("pass-deleted", "STUDENT"),
      createTestUser("pass-withdrawn", "STUDENT"),
    ]);
    await db.user.update({ where: { id: deleted.id }, data: { deletedAt: at(-1) } });
    await db.seasonEnrollment.createMany({
      data: [
        { seasonId, studentUserId: kept.id, status: "ACTIVE", enrolledAt: at(-30) },
        { seasonId, studentUserId: deleted.id, status: "ACTIVE", enrolledAt: at(-30) },
        { seasonId, studentUserId: withdrawn.id, status: "WITHDRAWN", enrolledAt: at(-30) },
      ],
    });
    const live = await createAssignmentWithParts({ seasonId, title: "Live" });
    const gone = await createAssignmentWithParts({ seasonId, title: "Gone", deletedAt: at(-1) });
    await setSubmitted(live.id, kept.id, at(-2));
    await setSubmitted(gone.id, kept.id, at(-2));

    const all = await loadPassingNumbers(seasonId, null, db, now);
    expect([...all.numbers.keys()]).toEqual([kept.id]);
    expect(all.numbers.get(kept.id)?.assignments).toEqual({ submitted: 1, total: 1 });
    // Asked for by id, a deleted account is still left out.
    expect((await loadPassingNumbers(seasonId, [deleted.id], db, now)).numbers.size).toBe(0);
  });

  it("a season with nothing to count has nothing available", async () => {
    const seasonId = (await createTestSeason()).id;
    const student = await createTestUser("pass-empty", "STUDENT");
    await db.seasonEnrollment.create({ data: { seasonId, studentUserId: student.id, status: "ACTIVE" } });
    await createAssignmentWithParts({ seasonId, title: "Deleted only", deletedAt: at(-1) });
    await quiz(seasonId, { title: "Draft only", kind: "ONLINE", maxScore: 10, publishedAt: null });
    // A future session is still something to count, though no one has a denominator yet.
    await session(seasonId, "Later", at(3));

    const { available, numbers } = await loadPassingNumbers(seasonId, null, db, now);
    expect(available).toEqual({ attendance: true, assignments: false, quizzes: false });
    expect(numbers.get(student.id)).toEqual({
      attendance: { attended: 0, total: 0 },
      assignments: { submitted: 0, total: 0 },
      quizzes: { scored: 0, max: 0 },
    });
  });
});
