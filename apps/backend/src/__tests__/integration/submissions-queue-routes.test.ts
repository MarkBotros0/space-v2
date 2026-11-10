import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { submissionQueueSchema } from "../../../../../packages/shared/src/index";
import { createAssignmentWithParts, seedTextWork, setSubmitted } from "./assignment-reads-setup";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";
import { seedSubmissionFixtures, seedSubmissionFor, type SubmissionFixtures } from "./submissions-setup";

// Generous for a cold database's first query.
jest.setTimeout(60000);

const app = createApp();

let f: SubmissionFixtures;

beforeAll(async () => {
  f = await seedSubmissionFixtures(app);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

function queue(query: string, token = f.adminToken) {
  return request(app).get(`/api/v1/submissions?${query}`).set(auth(token));
}

describe("GET /api/v1/submissions — the review queue", () => {
  it("the queue lists one item per essay", async () => {
    const due = new Date("2098-01-01T00:00:00Z");
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Two to review", dueAt: due }, [
      { kind: "VIDEO" },
      { kind: "ESSAY", prompt: "First question" },
      { kind: "ESSAY", prompt: "Second question" },
      { kind: "FORUM" },
    ]);
    const late = new Date("2098-01-02T00:00:00Z");
    const one = await seedTextWork(a.id, a.partIds[1]!, f.studentUserId, "SUBMITTED", { at: late });
    const two = await seedTextWork(a.id, a.partIds[2]!, f.studentUserId, "SUBMITTED", {
      at: new Date("2097-12-31T00:00:00Z"),
    });
    const post = await seedTextWork(a.id, a.partIds[3]!, f.studentUserId, "SUBMITTED");
    await setSubmitted(a.id, f.studentUserId, late);

    const res = await queue(`seasonId=${f.seasonId}&limit=100`);
    expect(res.status).toBe(200);
    const body = submissionQueueSchema.parse(res.body.data);
    const mine = body.items.filter((i) => i.assignmentId === a.id);
    expect(mine).toEqual([
      {
        publicId: one.publicId,
        assignmentId: a.id,
        assignmentTitle: "Two to review",
        prompt: "First question",
        studentName: "Test owner",
        submittedAt: late.toISOString(),
        isLate: true,
        reviewStatus: "SUBMITTED",
      },
      expect.objectContaining({ publicId: two.publicId, prompt: "Second question", isLate: false }),
    ]);
    // The forum post is never an item: only essays are reviewed.
    expect(body.items.some((i) => i.publicId === post.publicId)).toBe(false);
  });

  it("orders by status then recency and reports pending/total/late counts (REG-89)", async () => {
    const season = await createTestSeason();
    const admin = await createTestUser("queue-admin", "ADMIN");
    await db.seasonAdmin.create({ data: { seasonId: season.id, userId: admin.id } });
    await db.seasonEnrollment.create({
      data: { seasonId: season.id, studentUserId: f.studentUserId, status: "ACTIVE" },
    });
    const token = await login(app, admin.email);
    const day = (n: number) => new Date(Date.UTC(2098, 0, n));
    const mk = (title: string, status: "SUBMITTED" | "REVIEWED", at: Date, dueAt: Date | null) =>
      seedSubmissionFor(season.id, f.studentUserId, status, title, { submittedAt: at, dueAt });
    const revOld = await mk("Q reviewed old", "REVIEWED", day(1), null);
    const subOld = await mk("Q submitted old", "SUBMITTED", day(2), day(1)); // late
    const revNew = await mk("Q reviewed new", "REVIEWED", day(5), null);
    const subNew = await mk("Q submitted new", "SUBMITTED", day(6), null);
    await mk("Q draft", "SUBMITTED", day(7), null).then((pid) =>
      db.assignmentPartWork.update({ where: { publicId: pid }, data: { status: "DRAFT" } }),
    );

    const res = await queue(`pendingOnly=false&seasonId=${season.id}&limit=100`, token);
    const order = (res.body.data.items as { publicId: string }[]).map((i) => i.publicId);
    expect(order).toEqual([subNew, subOld, revNew, revOld]);
    expect(res.body.data.counts).toEqual({ pending: 2, total: 4, late: 1 });

    const pendingOnly = await queue(`seasonId=${season.id}&limit=100`, token);
    // The header describes the whole queue, not the filtered page.
    expect(pendingOnly.body.data.counts).toEqual(res.body.data.counts);
    expect(pendingOnly.body.data.items.map((i: { publicId: string }) => i.publicId)).toEqual([subNew, subOld]);

    // Paging follows the same order; counts ride on the first page only.
    const p1 = await queue(`pendingOnly=false&seasonId=${season.id}&limit=2`, token);
    const p2 = await queue(`pendingOnly=false&seasonId=${season.id}&limit=2&cursor=${p1.body.data.nextCursor}`, token);
    const ids = [...p1.body.data.items, ...p2.body.data.items].map((i: { publicId: string }) => i.publicId);
    expect(ids).toEqual(order);
    expect(p2.body.data.nextCursor).toBeNull();
    expect(p1.body.data.counts).toEqual(res.body.data.counts);
    expect(p2.body.data.counts).toBeNull();
  });

  it("scopes a leader's queue to their own students", async () => {
    const mine = await seedSubmissionFor(f.seasonId, f.studentUserId, "SUBMITTED", "Leader scope mine");
    const peers = await seedSubmissionFor(f.seasonId, f.peerUserId, "SUBMITTED", "Leader scope peer");
    const res = await queue("pendingOnly=false&limit=100", f.leaderToken);
    expect(res.status).toBe(200);
    const ids = (res.body.data.items as { publicId: string }[]).map((i) => i.publicId);
    expect(ids).toContain(mine);
    // peer is enrolled in the season but in no group this leader leads.
    expect(ids).not.toContain(peers);
  });

  it("never returns a DRAFT to a reviewer, and refuses a student outright", async () => {
    for (const token of [f.adminToken, f.leaderToken]) {
      const res = await queue("pendingOnly=false&limit=100", token);
      const items = res.body.data.items as { publicId: string; reviewStatus: string }[];
      expect(items.some((i) => i.publicId === f.publicId)).toBe(false);
      expect(items.every((i) => i.reviewStatus !== "DRAFT")).toBe(true);
    }
    expect((await queue("", f.ownerToken)).status).toBe(403);
  });
});

describe("review notification wording (REG-91)", () => {
  it("restores v1's Feedback ready title, and never carries the feedback", async () => {
    const pid = await seedSubmissionFor(f.seasonId, f.studentUserId, "SUBMITTED", "Wording check");
    await request(app)
      .post(`/api/v1/submissions/${pid}/review`)
      .set(auth(f.leaderToken))
      .send({ action: "reviewed", feedback: "<script>x</script>" });
    const n = await db.notification.findFirst({
      where: { userId: f.studentUserId, type: "SUBMISSION_REVIEWED", title: { contains: "Wording check" } },
      select: { title: true, body: true, link: true },
    });
    expect(n?.title).toBe('Feedback ready on "Wording check"');
    expect(JSON.stringify(n)).not.toContain("script");
    expect(n?.link).toMatch(/^\/student\/assignments\/\d+$/);
  });
});

describe("who may review (REG-88 scoping)", () => {
  it("refuses an admin of another season, a leader of another group, and an author who administers the season", async () => {
    const pid = await seedSubmissionFor(f.seasonId, f.studentUserId, "SUBMITTED", "Scoped review");

    const otherSeason = await createTestSeason();
    const otherAdmin = await createTestUser("other-admin", "ADMIN");
    await db.seasonAdmin.create({ data: { seasonId: otherSeason.id, userId: otherAdmin.id } });
    const otherLeader = await createTestUser("other-leader", "LEADER");
    await db.group.create({
      data: { seasonId: f.seasonId, name: "Group B", leaders: { create: { userId: otherLeader.id } } },
    });
    // An ADMIN of this season whose own work it is: the author guard must win.
    const selfAdmin = await createTestUser("self-admin", "ADMIN");
    await db.seasonAdmin.create({ data: { seasonId: f.seasonId, userId: selfAdmin.id } });
    const ownPid = await seedSubmissionFor(f.seasonId, selfAdmin.id, "SUBMITTED", "Self admin work");

    const attempt = async (email: string, target: string) =>
      request(app)
        .post(`/api/v1/submissions/${target}/review`)
        .set(auth(await login(app, email)))
        .send({ action: "reviewed", feedback: "no" });

    expect((await attempt(otherAdmin.email, pid)).status).toBe(403);
    expect((await attempt(otherLeader.email, pid)).status).toBe(403);
    expect((await attempt(selfAdmin.email, ownPid)).status).toBe(403);
    const untouched = await db.assignmentPartWork.findMany({
      where: { publicId: { in: [pid, ownPid] } },
      select: { status: true },
    });
    expect(untouched.map((u) => u.status)).toEqual(["SUBMITTED", "SUBMITTED"]);
  });
});
