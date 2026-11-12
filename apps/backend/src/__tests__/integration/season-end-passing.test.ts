import { db } from "../../db/client";
import { putMark } from "./assignment-staff-mark-setup";
import { cleanupTestData, createTestSeason, createTestUser, tokenFor } from "./fixtures";
import { CRITERIA, app, bodyFrom, endCheck, enrolmentOf, postEnd, seedEndWorld } from "./season-end-passing-setup";

// Season passing, Task 4: End takes the criteria, recomputes every score and stores it.
jest.setTimeout(90000);

beforeEach(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("End by the weighted score", () => {
  it("End stores the criteria, each score and its numbers", async () => {
    const w = await seedEndWorld();
    const check = await endCheck(w.seasonId, w.tokens.admin);
    expect(check.isDefault).toBe(true);
    expect(check.available).toEqual({ attendance: false, assignments: true, quizzes: true });
    const high = check.students.find((s) => s.userId === w.users.high.id)!;
    expect(high.numbers).toEqual({
      attendance: { attended: 0, total: 0 },
      assignments: { submitted: 2, total: 2 },
      quizzes: { scored: 80, max: 100 },
    });
    expect(high.attendancePct).toBe(0);

    const body = bodyFrom(check, CRITERIA, { notPassed: [{ userId: w.users.low.id, reason: "Below the mark" }] });
    expect(body.reviewed.scores).toEqual(
      expect.arrayContaining([
        { userId: w.users.high.id, score: 90 },
        { userId: w.users.low.id, score: 40 },
      ]),
    );
    const res = await postEnd(w.seasonId, w.tokens.admin, body);
    expect(res.status).toBe(200);

    const season = await db.season.findUniqueOrThrow({ where: { id: w.seasonId } });
    expect(season).toMatchObject({
      status: "COMPLETED",
      passWeightAttendance: 0,
      passWeightAssignments: 50,
      passWeightQuizzes: 50,
      passMark: 60,
    });
    expect(season.passCriteriaSetAt).not.toBeNull();

    const h = await enrolmentOf(w.seasonId, w.users.high.id);
    expect(Number(h.passScore)).toBe(90);
    expect(h).toMatchObject({ result: "PASSED", resultAgainstScore: false, resultSetById: w.users.admin.id });
    expect(h.passNumbers).toEqual(high.numbers);
    const l = await enrolmentOf(w.seasonId, w.users.low.id);
    expect(Number(l.passScore)).toBe(40);
    expect(l).toMatchObject({
      result: "NOT_PASSED",
      resultReason: "Below the mark",
      resultAgainstScore: false,
      resultSetById: w.users.admin.id,
    });
  });

  it("a score that changed since the preview is refused", async () => {
    const w = await seedEndWorld();
    const check = await endCheck(w.seasonId, w.tokens.admin);
    // Between the preview and the POST, staff mark the low student's second assignment: 40.0 → 65.0.
    expect((await putMark(app, w.assignments.second, w.users.low.id, w.tokens.admin)).status).toBe(200);

    const res = await postEnd(w.seasonId, w.tokens.admin, bodyFrom(check));
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: "season_unfinished",
      message: "The scores changed; check the season again.",
    });
    const season = await db.season.findUniqueOrThrow({ where: { id: w.seasonId } });
    expect(season).toMatchObject({ status: "ACTIVE", passMark: null, passCriteriaSetAt: null });
    for (const id of [w.users.high.id, w.users.low.id]) {
      expect(await enrolmentOf(w.seasonId, id)).toMatchObject({
        status: "ACTIVE",
        result: null,
        passScore: null,
        passNumbers: null,
        resultSetById: null,
      });
    }

    // Shown again, the new score ends the season.
    const again = await postEnd(w.seasonId, w.tokens.admin, bodyFrom(await endCheck(w.seasonId, w.tokens.admin)));
    expect(again.status).toBe(200);
    expect(Number((await enrolmentOf(w.seasonId, w.users.low.id)).passScore)).toBe(65);
  });

  it("a weight on a season with no quizzes is 400 weight_on_empty", async () => {
    const w = await seedEndWorld({ quiz: false });
    const check = await endCheck(w.seasonId, w.tokens.admin);
    expect(check.available.quizzes).toBe(false);
    const res = await postEnd(
      w.seasonId,
      w.tokens.admin,
      bodyFrom(check, { weights: { attendance: 0, assignments: 70, quizzes: 30 }, passMark: 60 }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: "weight_on_empty",
      message: "Quizzes has nothing to count this season, so its weight must be 0.",
    });
    expect((await db.season.findUniqueOrThrow({ where: { id: w.seasonId } })).status).toBe("ACTIVE");
  });

  it("passing below the mark and failing above it are stored as against the score, with the optional note", async () => {
    const w = await seedEndWorld();
    const check = await endCheck(w.seasonId, w.tokens.admin);
    const res = await postEnd(
      w.seasonId,
      w.tokens.admin,
      bodyFrom(check, CRITERIA, {
        notPassed: [{ userId: w.users.high.id, reason: "Left before the end" }],
        passedNotes: [{ userId: w.users.low.id, note: "  Caught up in person  " }],
      }),
    );
    expect(res.status).toBe(200);
    expect(await enrolmentOf(w.seasonId, w.users.high.id)).toMatchObject({
      result: "NOT_PASSED",
      resultReason: "Left before the end",
      resultAgainstScore: true,
    });
    expect(await enrolmentOf(w.seasonId, w.users.low.id)).toMatchObject({
      result: "PASSED",
      resultReason: "Caught up in person",
      resultAgainstScore: true,
    });
  });

  it("a note for a student who did not pass, or a weight sum off 100, is 400 and changes nothing", async () => {
    const w = await seedEndWorld();
    const check = await endCheck(w.seasonId, w.tokens.admin);
    const noteOnFailed = bodyFrom(check, CRITERIA, {
      notPassed: [{ userId: w.users.low.id, reason: null }],
      passedNotes: [{ userId: w.users.low.id, note: "x" }],
    });
    expect((await postEnd(w.seasonId, w.tokens.admin, noteOnFailed)).status).toBe(400);
    const off = { ...bodyFrom(check), weights: { attendance: 0, assignments: 50, quizzes: 40 } };
    const res = await postEnd(w.seasonId, w.tokens.admin, off);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("The weights must add up to 100%.");
    expect((await db.season.findUniqueOrThrow({ where: { id: w.seasonId } })).status).toBe("ACTIVE");
  });

  it("a season with nothing to count ends with no scores", async () => {
    const seasonId = (await createTestSeason()).id;
    const [admin, student] = await Promise.all([
      createTestUser("end-empty-admin", "ADMIN"),
      createTestUser("end-empty-student", "STUDENT"),
    ]);
    await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
    await db.seasonEnrollment.create({ data: { seasonId, studentUserId: student.id, status: "ACTIVE" } });
    const token = await tokenFor(admin.id);
    const check = await endCheck(seasonId, token);
    expect(check.available).toEqual({ attendance: false, assignments: false, quizzes: false });

    const res = await postEnd(seasonId, token, bodyFrom(check, check.criteria));
    expect(res.status).toBe(200);
    expect(await enrolmentOf(seasonId, student.id)).toMatchObject({
      result: "PASSED",
      passScore: null,
      resultAgainstScore: false,
    });
  });

  it("the database refuses a score off 0..100, a part above its whole, and against no score", async () => {
    const w = await seedEndWorld({ quiz: false });
    const where = { studentUserId_seasonId: { studentUserId: w.users.high.id, seasonId: w.seasonId } };
    const numbers = {
      attendance: { attended: 0, total: 0 },
      assignments: { submitted: 2, total: 2 },
      quizzes: { scored: 0, max: 0 },
    };
    await expect(db.seasonEnrollment.update({ where, data: { passScore: 100.1 } })).rejects.toThrow();
    await expect(
      db.seasonEnrollment.update({
        where,
        data: { passNumbers: { ...numbers, assignments: { submitted: 3, total: 2 } } },
      }),
    ).rejects.toThrow();
    await expect(db.seasonEnrollment.update({ where, data: { resultAgainstScore: true } })).rejects.toThrow();
    await db.seasonEnrollment.update({
      where,
      data: { passScore: 100, passNumbers: numbers, resultAgainstScore: true },
    });
  });
});
