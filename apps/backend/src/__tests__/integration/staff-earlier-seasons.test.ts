// Community model, Build 2, Task 7: season admins and leaders see nothing of a
// student's earlier seasons, only the live season they serve in. The people
// picker is the one exception.
import request from "supertest";

import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import { createTestUser, login } from "./fixtures";
import {
  app,
  as,
  ctx,
  person,
  season,
  seedEnrollmentFixtures,
  teardownEnrollmentFixtures,
} from "./season-enrollments-setup";

jest.setTimeout(180000);

let seasonA: number;
let seasonB: number;
let groupA: number;
let groupB: number;
let studentId: number;
let adminB: number;
let leaderB: number;
let adminT: string;
let leaderT: string;
let mentorT: string;
let studentT: string;
let adminOwnNoteInA: number;

const get = (path: string, token: string) => request(app).get(`/api/v1${path}`).set(as(token));

async function workIn(seasonId: number, label: string) {
  const sessionRow = await db.session.create({
    data: { seasonId, title: `${label} session`, startsAt: new Date(Date.now() - 86_400_000), durationMinutes: 60 },
    select: { id: true },
  });
  await db.attendance.create({ data: { sessionId: sessionRow.id, studentUserId: studentId, status: "PRESENT" } });
  const assignment = await db.assignment.create({
    data: { seasonId, title: `${label} essay`, isAllGroups: true },
    select: { id: true },
  });
  await db.submission.create({
    data: {
      publicId: newPublicId(),
      assignmentId: assignment.id,
      studentUserId: studentId,
      text: "<p>work</p>",
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });
}

const note = (
  body: string,
  authorUserId: number,
  seasonId: number | null,
  visibility: "ADMINS" | "LEADERS" | "MENTORS",
) =>
  db.engagementNote.create({
    data: { studentUserId: studentId, authorUserId, seasonId, body, visibility },
    select: { id: true },
  });

const titles = (rows: { seasonId: number }[]) => rows.map((r) => r.seasonId).sort((x, y) => x - y);
const bodies = (rows: { body: string }[]) => rows.map((r) => r.body).sort();

beforeAll(async () => {
  await seedEnrollmentFixtures();
  seasonA = await season("COMPLETED", "GBV 2026", null, "GBV");
  seasonB = await season("ACTIVE", "LEAD 2027", null, "LEAD");
  const student = await person("Mina");
  studentId = student.id;
  studentT = await login(app, student.email);
  const admin = await person("Admin of both", 2020);
  adminB = admin.id;
  await db.seasonAdmin.createMany({ data: [seasonA, seasonB].map((seasonId) => ({ seasonId, userId: admin.id })) });
  adminT = await login(app, admin.email);
  const leader = await person("Leader of both", 2020);
  leaderB = leader.id;
  groupA = (
    await db.group.create({
      data: { seasonId: seasonA, name: "Earlier group", leaders: { create: { userId: leader.id } } },
    })
  ).id;
  groupB = (
    await db.group.create({
      data: { seasonId: seasonB, name: "Current group", leaders: { create: { userId: leader.id } } },
    })
  ).id;
  leaderT = await login(app, leader.email);
  mentorT = await login(app, (await createTestUser("earlier-mentor", "MENTOR")).email);

  await db.seasonEnrollment.createMany({
    data: [
      {
        seasonId: seasonA,
        studentUserId: studentId,
        groupId: groupA,
        status: "COMPLETED",
        result: "PASSED",
        completedAt: new Date(Date.UTC(2026, 5, 1)),
        enrolledAt: new Date(Date.UTC(2020, 0, 1)),
      },
      {
        seasonId: seasonB,
        studentUserId: studentId,
        groupId: groupB,
        status: "ACTIVE",
        enrolledAt: new Date(Date.UTC(2020, 0, 1)),
      },
    ],
  });
  // Only an earlier season's membership: the "current group" must not surface it.
  await db.groupStudent.create({ data: { seasonId: seasonA, groupId: groupA, studentUserId: studentId } });
  await workIn(seasonA, "A");
  await workIn(seasonB, "B");

  const superUser = ctx.superId;
  await note("A admins", superUser, seasonA, "ADMINS");
  await note("B admins", superUser, seasonB, "ADMINS");
  await note("no season admins", superUser, null, "ADMINS");
  await note("A leaders", superUser, seasonA, "LEADERS");
  await note("B leaders", superUser, seasonB, "LEADERS");
  await note("no season leaders", superUser, null, "LEADERS");
  await note("A mentors", superUser, seasonA, "MENTORS");
  adminOwnNoteInA = (await note("A admin's own", adminB, seasonA, "ADMINS")).id;
  await note("A leader's own", leaderB, seasonA, "LEADERS");
});
afterAll(teardownEnrollmentFixtures);

describe.each([
  ["an admin", () => adminT, ["B admins", "no season admins"]],
  ["a leader", () => leaderT, ["B leaders", "no season leaders"]],
] as const)("%s of the later season, who also served in the earlier one", (_who, token, notes) => {
  it("sees only that season's row in the student's detail", async () => {
    const res = await get(`/students/${studentId}`, token());
    expect(res.status).toBe(200);
    expect(titles(res.body.data.enrollments)).toEqual([seasonB]);
    expect(res.body.data.profile.activeSeasonId).toBe(seasonB);
    expect(res.body.data.currentGroup).toBeNull();
    expect(JSON.stringify(res.body.data)).not.toContain("GBV 2026");
    expect(JSON.stringify(res.body.data)).not.toContain("Earlier group");
  });

  it("sees none of the earlier attendance or submissions", async () => {
    const attendance = await get(`/students/${studentId}/attendance`, token());
    expect(titles(attendance.body.data.history)).toEqual([seasonB]);
    const submissions = await get(`/students/${studentId}/submissions`, token());
    expect(titles(submissions.body.data.submissions)).toEqual([seasonB]);
  });

  it("reads the live season's notes and notes with no season, not the earlier season's, their own included", async () => {
    const res = await get(`/students/${studentId}/notes`, token());
    expect(res.status).toBe(200);
    expect(bodies(res.body.data.notes)).toEqual([...notes].sort());
  });

  it("can't score the earlier season", async () => {
    expect((await get(`/students/${studentId}/engagement?seasonId=${seasonA}`, token())).status).toBe(403);
    expect((await get(`/students/${studentId}/engagement?seasonId=${seasonB}`, token())).status).toBe(200);
  });

  it("doesn't find the earlier season's group or the student's other season on the student list", async () => {
    const res = await get("/students?status=active", token());
    const row = (res.body.data.students as { id: number; currentGroupName: string | null }[]).find(
      (s) => s.id === studentId,
    );
    expect(row?.currentGroupName).toBeNull();
  });

  it("can't file a note under the earlier season", async () => {
    const res = await request(app)
      .post(`/api/v1/students/${studentId}/notes`)
      .set(as(token()))
      .send({ body: "Late thought", seasonId: seasonA, visibility: "ADMINS", followUpFlagged: false });
    expect(res.status).toBe(403);
  });

  it("files a note under the season they serve in by default", async () => {
    const res = await request(app)
      .post(`/api/v1/students/${studentId}/notes`)
      .set(as(token()))
      .send({ body: "Current thought", visibility: "LEADERS", followUpFlagged: false });
    expect(res.status).toBe(201);
    expect(res.body.data.note.seasonId).toBe(seasonB);
    await db.engagementNote.delete({ where: { id: res.body.data.note.id } });
  });
});

describe.each([
  ["an admin", () => adminT],
  ["a leader", () => leaderT],
] as const)("%s filtering the student list", (_who, token) => {
  const ids = async (query: string, t = token()) => {
    const res = await get(`/students?status=active&${query}`, t);
    expect(res.status).toBe(200);
    return (res.body.data.students as { id: number }[]).map((s) => s.id);
  };

  it("finds an unplaced returning student under Unassigned, despite an earlier group", async () => {
    expect(await ids("groupId=none")).toContain(studentId);
  });

  it("learns nothing from an earlier group's id", async () => {
    expect(await ids(`groupId=${groupA}`)).toEqual([]);
  });

  it("learns nothing from an earlier season's id, and finds the live one", async () => {
    expect(await ids(`seasonId=${seasonA}`)).toEqual([]);
    expect(await ids(`seasonId=${seasonB}`)).toContain(studentId);
  });

  it("finds them under their own group even with a newer group in a season they don't see", async () => {
    const other = await season("DRAFT", "Elsewhere");
    const elsewhere = await db.group.create({ data: { seasonId: other, name: "Elsewhere group" } });
    await db.groupStudent.createMany({
      data: [
        { seasonId: seasonB, groupId: groupB, studentUserId: studentId, enrolledAt: new Date(Date.UTC(2021, 0, 1)) },
        {
          seasonId: other,
          groupId: elsewhere.id,
          studentUserId: studentId,
          enrolledAt: new Date(Date.UTC(2022, 0, 1)),
        },
      ],
    });
    try {
      expect(await ids(`groupId=${groupB}`)).toContain(studentId);
      expect(await ids(`groupId=${elsewhere.id}`)).toEqual([]);
      expect(await ids("groupId=none")).not.toContain(studentId);
    } finally {
      await db.groupStudent.deleteMany({ where: { studentUserId: studentId, seasonId: { in: [seasonB, other] } } });
    }
  });
});

describe("the student list's filters for those who see every season", () => {
  it("still go by the newest membership anywhere", async () => {
    const res = await get(`/students?status=active&groupId=${groupA}`, ctx.superToken);
    expect((res.body.data.students as { id: number }[]).map((s) => s.id)).toEqual([studentId]);
    const none = await get("/students?status=active&groupId=none&limit=100", mentorT);
    expect((none.body.data.students as { id: number }[]).map((s) => s.id)).not.toContain(studentId);
    const earlier = await get(`/students?status=active&seasonId=${seasonA}`, mentorT);
    expect((earlier.body.data.students as { id: number }[]).map((s) => s.id)).toEqual([studentId]);
  });
});

describe("an admin of two live seasons", () => {
  it("filters to the one season named, not every season they run", async () => {
    const first = await season("ACTIVE", "First");
    const second = await season("ACTIVE", "Second");
    const [inFirst, inSecond, admin] = [
      await person("In first"),
      await person("In second"),
      await person("Two seasons", 2020),
    ];
    await db.seasonAdmin.createMany({ data: [first, second].map((seasonId) => ({ seasonId, userId: admin.id })) });
    await db.seasonEnrollment.createMany({
      data: [
        { seasonId: first, studentUserId: inFirst.id },
        { seasonId: second, studentUserId: inSecond.id },
      ],
    });
    const res = await get(`/students?status=active&seasonId=${first}`, await login(app, admin.email));
    expect((res.body.data.students as { id: number }[]).map((s) => s.id)).toEqual([inFirst.id]);
  });
});

describe("notes an admin wrote in the earlier season", () => {
  it("leave their own notes list", async () => {
    const res = await get("/me/notes", adminT);
    expect(res.status).toBe(200);
    expect(bodies(res.body.data.notes)).not.toContain("A admin's own");
  });

  it("can't be edited any more", async () => {
    const res = await request(app)
      .patch(`/api/v1/notes/${adminOwnNoteInA}`)
      .set(as(adminT))
      .send({ body: "Rewritten" });
    expect(res.status).toBe(403);
  });
});

describe("an admin of a draft whose student is live in another season", () => {
  it("doesn't see that season, in detail or on the list", async () => {
    const draft = await season("DRAFT", "Draft 2028");
    const token = await (async () => {
      const admin = await person("Draft admin", 2020);
      await db.seasonAdmin.create({ data: { seasonId: draft, userId: admin.id } });
      return login(app, admin.email);
    })();
    await db.seasonEnrollment.create({ data: { seasonId: draft, studentUserId: studentId, status: "ACTIVE" } });

    try {
      const detail = await get(`/students/${studentId}`, token);
      expect(titles(detail.body.data.enrollments)).toEqual([draft]);
      expect(detail.body.data.profile.activeSeasonId).toBeNull();
      expect(detail.body.data.profile.activeSeasonTitle).toBeNull();

      const list = await get("/students?status=active", token);
      const row = (list.body.data.students as { id: number; activeSeasonTitle: string | null }[]).find(
        (s) => s.id === studentId,
      );
      expect(row).toBeDefined();
      expect(row?.activeSeasonTitle).toBeNull();
    } finally {
      await db.seasonEnrollment.delete({
        where: { studentUserId_seasonId: { studentUserId: studentId, seasonId: draft } },
      });
    }
  });
});

describe("those who keep the whole picture", () => {
  it("SUPER sees every season, with its attendance, submissions and notes", async () => {
    const detail = await get(`/students/${studentId}`, ctx.superToken);
    expect(titles(detail.body.data.enrollments)).toEqual([seasonA, seasonB]);
    expect(detail.body.data.currentGroup.name).toBe("Earlier group");
    expect(titles((await get(`/students/${studentId}/attendance`, ctx.superToken)).body.data.history)).toEqual([
      seasonA,
      seasonB,
    ]);
    expect(titles((await get(`/students/${studentId}/submissions`, ctx.superToken)).body.data.submissions)).toEqual([
      seasonA,
      seasonB,
    ]);
    expect(bodies((await get(`/students/${studentId}/notes`, ctx.superToken)).body.data.notes)).toContain("A admins");
  });

  it("MENTOR too", async () => {
    const detail = await get(`/students/${studentId}`, mentorT);
    expect(titles(detail.body.data.enrollments)).toEqual([seasonA, seasonB]);
    expect(titles((await get(`/students/${studentId}/attendance`, mentorT)).body.data.history)).toEqual([
      seasonA,
      seasonB,
    ]);
    expect(titles((await get(`/students/${studentId}/submissions`, mentorT)).body.data.submissions)).toEqual([
      seasonA,
      seasonB,
    ]);
    expect(bodies((await get(`/students/${studentId}/notes`, mentorT)).body.data.notes)).toEqual(["A mentors"]);
  });

  it("the student's own view still holds every season", async () => {
    const detail = await get(`/students/${studentId}`, studentT);
    expect(titles(detail.body.data.enrollments)).toEqual([seasonA, seasonB]);
  });
});

describe("the people picker, the one exception", () => {
  it("still shows the admin the earlier season's title and result", async () => {
    const res = await get(`/seasons/${seasonB}/people-candidates`, adminT);
    expect(res.status).toBe(200);
    const row = (res.body.data.people as { id: number; last: unknown }[]).find((p) => p.id === studentId);
    expect(row?.last).toMatchObject({ seasonTitle: "GBV 2026", outcome: "PASSED" });
  });
});
