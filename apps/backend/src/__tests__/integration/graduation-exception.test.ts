// Community model, Build 2: graduating someone by exception needs a reason, keeps it on the
// user, and shows it to a SUPER alone.
import request from "supertest";

import { db } from "../../db/client";
import { createTestUser } from "./fixtures";
import { auditLines, enrol, finished, graduate, mint, seasonOf } from "./graduating-seasons-setup";
import { adminTokenOf, app, as, ctx, person, seedEnrollmentFixtures, teardownEnrollmentFixtures } from "./season-enrollments-setup";

jest.setTimeout(180000);

beforeAll(seedEnrollmentFixtures);
afterAll(teardownEnrollmentFixtures);

const REASON = "Completed the program abroad";
const columns = (id: number) =>
  db.user.findUniqueOrThrow({
    where: { id },
    select: { graduationYear: true, graduationOverrideAt: true, graduationOverrideById: true, graduationOverrideReason: true },
  });
const detailOf = (id: number, token: string) => request(app).get(`/api/v1/students/${id}`).set(as(token));

describe("The reason for an exception", () => {
  it.each([
    ["missing", {}],
    ["too short", { overrideReason: "too short" }],
    ["only spaces", { overrideReason: "                " }],
    ["too long", { overrideReason: "x".repeat(1001) }],
  ])("%s: 400 bad_request, and nobody graduates", async (_label, extra) => {
    const student = await person("NoReason");
    const res = await graduate(student.id, { graduationYear: 2025, override: true, ...extra });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    expect(typeof res.body.error.message).toBe("string");
    expect((await columns(student.id)).graduationYear).toBeNull();
  });

  it("is kept trimmed with who and when, in the same write as the graduation", async () => {
    const student = await person("Reasoned");
    const res = await graduate(student.id, { graduationYear: 2025, override: true, overrideReason: `  ${REASON}  ` });
    expect(res.status).toBe(200);
    const row = await columns(student.id);
    expect(row).toMatchObject({ graduationYear: 2025, graduationOverrideById: ctx.superId, graduationOverrideReason: REASON });
    expect(row.graduationOverrideAt).toBeInstanceOf(Date);
  });

  it("is audited as an override without its text", async () => {
    const student = await person("Quiet");
    const lines = await auditLines(async () => {
      expect((await graduate(student.id, { graduationYear: 2025, override: true, overrideReason: REASON })).status).toBe(200);
    });
    expect(lines).toContain(`[audit] student.graduate actor=${ctx.superId} subject=${student.id} override=true`);
    expect(lines.join("\n")).not.toContain(REASON);
  });

  it("is dropped when the student had qualified, so nothing records an exception", async () => {
    const student = await person("Qualified");
    await finished(await seasonOf("ARCHIVED", true), student.id, "PASSED");
    const res = await graduate(student.id, { graduationYear: 2025, override: true, overrideReason: REASON });
    expect(res.status).toBe(200);
    expect(await columns(student.id)).toMatchObject({
      graduationYear: 2025,
      graduationOverrideAt: null,
      graduationOverrideById: null,
      graduationOverrideReason: null,
    });
  });

  it("an unqualified student still needs the override flag, reason or not", async () => {
    const student = await person("Flagless");
    const res = await graduate(student.id, { graduationYear: 2025, overrideReason: REASON });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("not_qualified");
    expect((await columns(student.id)).graduationOverrideReason).toBeNull();
  });
});

describe("Who sees graduatedByException", () => {
  it("a super does, with the name, time and reason", async () => {
    const student = await person("Seen");
    await graduate(student.id, { graduationYear: 2025, override: true, overrideReason: REASON });
    const res = await detailOf(student.id, ctx.superToken);
    expect(res.status).toBe(200);
    const exception = res.body.data.graduatedByException;
    expect(exception.reason).toBe(REASON);
    expect(typeof exception.byName).toBe("string");
    expect(new Date(exception.at).getTime()).toBeGreaterThan(0);
  });

  it("a super sees null for someone who graduated the usual way", async () => {
    const student = await person("Usual", 2020);
    expect((await detailOf(student.id, ctx.superToken)).body.data.graduatedByException).toBeNull();
  });

  it("the student themselves, an admin and a mentor get neither the key nor the text", async () => {
    const student = await person("Hidden");
    const live = await seasonOf("ACTIVE", false);
    await enrol(live, student.id);
    await graduate(student.id, { graduationYear: 2025, override: true, overrideReason: REASON });
    const mentor = await createTestUser("gx-mentor", "MENTOR");
    const admin = await adminTokenOf(live);
    for (const token of [await mint(student.id), admin, await mint(mentor.id)]) {
      const res = await detailOf(student.id, token);
      if (res.status === 200) {
        expect(res.body.data).not.toHaveProperty("graduatedByException");
        expect(JSON.stringify(res.body)).not.toContain(REASON);
      }
    }
    const own = await detailOf(student.id, await mint(student.id));
    expect(own.status).toBe(200);
    expect(own.body.data).not.toHaveProperty("graduatedByException");
  });
});
