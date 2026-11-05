import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestUser } from "./fixtures";
import { seedGroupFixtures } from "./groups-setup";

// 60s, not the Jest default: the shared Neon staging database autosuspends, so
// the first query after idle costs ~18s and this suite's beforeAll performs
// several sequential writes.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let groupAId: number;
let superToken: string;
let leaderToken: string;
let studentToken: string;
let outsiderToken: string;

beforeAll(async () => {
  ({ seasonId, groupAId, superToken, leaderToken, studentToken, outsiderToken } = await seedGroupFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/seasons/:id/groups", () => {
  it("returns every group in the season for a SUPER", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.groups).toHaveLength(2);
    const a = res.body.data.groups.find((g: { id: number }) => g.id === groupAId);
    expect(a).toEqual({
      id: groupAId,
      name: "Group A",
      description: "First group",
      // ACTIVE season enrolments naming this group, not GroupStudent rows.
      studentCount: 1,
      leaderNames: ["Test leader"],
      seasonId,
      seasonCode: expect.any(String),
      seasonTitle: "Test Season",
    });
  });

  it("narrows the list to a student's own group", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.groups).toHaveLength(1);
    expect(res.body.data.groups[0].id).toBe(groupAId);
  });

  it("returns 403 for a user with no access to the season", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 400 for a non-numeric season id", async () => {
    const res = await request(app)
      .get("/api/v1/seasons/abc/groups")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(400);
  });

  it("counts only active enrolments, not students who withdrew", async () => {
    // The seasons spec flags this as D7: v1's headcount includes withdrawn
    // students, so a group reads as full of people who left. Counting the
    // enrolment rather than the GroupStudent row is what makes the status
    // available to filter on at all.
    const quitter = await createTestUser("quitter", "STUDENT");
    await db.seasonEnrollment.create({
      data: {
        seasonId,
        studentUserId: quitter.id,
        groupId: groupAId,
        status: "WITHDRAWN",
      },
    });

    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${superToken}`);

    const a = res.body.data.groups.find((g: { id: number }) => g.id === groupAId);
    expect(a.studentCount).toBe(1);
  });

  it("narrows the list to the groups a leader actually leads", async () => {
    // v1 handed a leader every group in the season — a roster of other
    // people's students with a headcount attached.
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.groups).toHaveLength(1);
    expect(res.body.data.groups[0].id).toBe(groupAId);
  });
});

describe("POST /api/v1/seasons/:id/groups and PATCH /api/v1/groups/:id", () => {
  async function newStudentEnrolled(label: string) {
    const u = await createTestUser(label, "STUDENT");
    await db.seasonEnrollment.create({
      data: { seasonId, studentUserId: u.id, status: "ACTIVE" },
    });
    return u;
  }

  it("creates a group with leaders and students", async () => {
    const leader2 = await createTestUser("leader2", "LEADER");
    const s1 = await newStudentEnrolled("new-s1");

    const res = await request(app)
      .post(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Wednesday", leaderIds: [leader2.id], studentIds: [s1.id] });

    expect(res.status).toBe(201);
    const enrollment = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: s1.id, seasonId } },
      select: { groupId: true },
    });
    expect(enrollment?.groupId).toBe(res.body.data.id);
    // GroupStudent is kept as this season's mirror of the enrolment (Plan 18 M1).
    const mirror = await db.groupStudent.findUnique({
      where: { seasonId_studentUserId: { seasonId, studentUserId: s1.id } },
      select: { groupId: true },
    });
    expect(mirror?.groupId).toBe(res.body.data.id);
  });

  it("refuses a leader who is not a leader", async () => {
    // v1 read leaderIds off the raw body. A GroupLeader row is a token claim,
    // so an unvalidated list here is a privilege path, not a typo.
    const student = await newStudentEnrolled("not-a-leader");
    const res = await request(app)
      .post(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Bad leaders", leaderIds: [student.id] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("invalid_leader");
  });

  it("refuses a student who is not enrolled in the season", async () => {
    const stranger = await createTestUser("stranger", "STUDENT");
    const res = await request(app)
      .post(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Bad students", studentIds: [stranger.id] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("not_enrolled");
  });

  it("refuses a duplicate name within the season", async () => {
    // No database constraint exists and the CSV importer matches groups by
    // name, so two groups sharing one silently misroute an import.
    const res = await request(app)
      .post(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Group A" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("name_taken");
  });

  it("preserves enrolment history when the roster changes", async () => {
    // v1's group form deleted and recreated the enrolment, resetting status,
    // droppedAt and dropReason — a withdrawn student silently came back as
    // ACTIVE with their reason for leaving erased, on a model the schema calls
    // append-only.
    const quitter = await createTestUser("history", "STUDENT");
    const droppedAt = new Date("2099-02-01T00:00:00.000Z");
    await db.seasonEnrollment.create({
      data: {
        seasonId,
        studentUserId: quitter.id,
        status: "WITHDRAWN",
        droppedAt,
        dropReason: "moved away",
      },
    });

    const created = await request(app)
      .post(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "History group", studentIds: [quitter.id] });
    expect(created.status).toBe(201);

    const after = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: quitter.id, seasonId } },
      select: { status: true, dropReason: true, groupId: true },
    });
    expect(after).toMatchObject({
      status: "WITHDRAWN",
      dropReason: "moved away",
      groupId: created.body.data.id,
    });
  });

  it("clears the group pointer of a removed student without dropping their enrolment", async () => {
    const s = await newStudentEnrolled("removed");
    const created = await request(app)
      .post(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Shrinking", studentIds: [s.id] });

    await request(app)
      .patch(`/api/v1/groups/${created.body.data.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Shrinking", studentIds: [] });

    const after = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: s.id, seasonId } },
      select: { groupId: true, status: true },
    });
    expect(after).toMatchObject({ groupId: null, status: "ACTIVE" });
  });

  it("refuses a leader of the group, who may not change its leadership", async () => {
    const res = await request(app)
      .patch(`/api/v1/groups/${groupAId}`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ name: "Hijacked" });
    expect(res.status).toBe(403);
  });

  it("refuses a name under two characters", async () => {
    const res = await request(app)
      .post(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "x" });
    expect(res.status).toBe(400);
  });
});
