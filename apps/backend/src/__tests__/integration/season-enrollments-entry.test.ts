// Community model, Build 2, Task 5: every other way into a season runs the same
// check as POST /seasons/:id/enrollments.
import request from "supertest";

import { db } from "../../db/client";
import { testEmail } from "./fixtures";
import {
  app,
  as,
  ctx,
  finishedGbv,
  leading,
  person,
  rowOf,
  season,
  seedEnrollmentFixtures,
  teardownEnrollmentFixtures,
} from "./season-enrollments-setup";

jest.setTimeout(180000);

beforeAll(seedEnrollmentFixtures);
afterAll(teardownEnrollmentFixtures);

describe("the other ways into a season", () => {
  const enroll = (studentId: number, seasonId: number) =>
    request(app).post(`/api/v1/students/${studentId}/enrollments`).set(as(ctx.superToken)).send({ seasonId });
  const commit = (seasonId: number, onExisting: "enroll" | "skip", rows: { name: string; email: string }[]) =>
    request(app)
      .post("/api/v1/imports/students/commit")
      .set(as(ctx.superToken))
      .send({
        mode: "season",
        seasonId,
        onExisting,
        rows: rows.map((cells, i) => ({
          rowNumber: i + 2,
          values: {
            university: null,
            faculty: null,
            universityGraduationYear: null,
            phone: null,
            dateOfBirth: null,
            notes: null,
            ...cells,
          },
        })),
      });

  it("createEnrollment refuses an in-role or a blocked person", async () => {
    const mina = await person("Mina");
    await leading(mina.id);
    const active = await season("ACTIVE");
    const inRole = await enroll(mina.id, active);
    expect(inRole.status).toBe(409);
    expect(inRole.body.error).toEqual({ code: "already_in_role", message: "Mina is already leading a group in GBV 2026" });

    const sara = await person("Sara");
    await finishedGbv(sara.id, "NOT_PASSED");
    const blocked = await enroll(sara.id, await season("DRAFT", "LEAD 2027", "GBV", "LEAD"));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toEqual({ code: "not_eligible", message: "Sara did not pass GBV 2026" });
  });

  it("POST /students with a season refuses a new person a required program blocks, and writes nothing", async () => {
    const target = await season("DRAFT", "LEAD 2027", "GBV", "LEAD");
    const email = testEmail("se-new");
    const res = await request(app)
      .post("/api/v1/students")
      .set(as(ctx.superToken))
      .send({ name: "New Person", email, seasonId: target });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "not_eligible", message: "New Person hasn't finished GBV yet" });
    expect(await db.user.count({ where: { email } })).toBe(0);

    const open = await season("DRAFT");
    const created = await request(app)
      .post("/api/v1/students")
      .set(as(ctx.superToken))
      .send({ name: "New Person", email, seasonId: open });
    expect(created.status).toBe(201);
    expect(await rowOf(open, created.body.data.id)).toMatchObject({ status: "ACTIVE" });
  });

  it("the import refuses an in-role person by row, naming why, and still enrols the rest", async () => {
    const target = await season("ACTIVE");
    const mina = await person("Mina");
    await leading(mina.id);
    const free = await person("Free");
    const newEmail = testEmail("se-import");

    const res = await commit(target, "enroll", [
      { name: "Mina", email: mina.email },
      { name: "Free", email: free.email },
      { name: "Brand New", email: newEmail },
    ]);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 1, enrolled: 1, skipped: 1 });
    expect(res.body.data.rows[0]).toMatchObject({
      outcome: "skipped",
      message: "Mina is already leading a group in GBV 2026",
    });
    expect(res.body.data.rows[1]).toMatchObject({ outcome: "enrolled" });
    expect(await rowOf(target, mina.id)).toBeNull();
    expect(await rowOf(target, free.id)).toMatchObject({ status: "ACTIVE" });
  });

  it("the import refuses a blocked person and a new row, naming why, and writes neither", async () => {
    const target = await season("DRAFT", "LEAD 2027", "GBV", "LEAD");
    const sara = await person("Sara");
    await finishedGbv(sara.id, "NOT_PASSED");
    const peter = await person("Peter");
    await finishedGbv(peter.id, "PASSED");
    const newEmail = testEmail("se-import");

    const res = await commit(target, "enroll", [
      { name: "Sara", email: sara.email },
      { name: "Peter", email: peter.email },
      { name: "Brand New", email: newEmail },
    ]);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 0, enrolled: 1, skipped: 2 });
    expect(res.body.data.rows[0]).toMatchObject({ outcome: "skipped", message: "Sara did not pass GBV 2026" });
    expect(res.body.data.rows[2]).toMatchObject({
      outcome: "skipped",
      message: "Brand New hasn't finished GBV yet",
      userId: null,
    });
    expect(await db.user.count({ where: { email: newEmail } })).toBe(0);
    expect(await rowOf(target, sara.id)).toBeNull();
    expect(await rowOf(target, peter.id)).toMatchObject({ status: "ACTIVE" });
  });
});
