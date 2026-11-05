// apps/backend/src/__tests__/integration/notes-visible-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestUser } from "./fixtures";
import { seedNotesFixtures, type NotesFixtures } from "./notes-setup";

jest.setTimeout(60000);

const app = createApp();
let f: NotesFixtures;

beforeAll(async () => {
  f = await seedNotesFixtures(app);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const URL = "/api/v1/me/visible-notes";
const get = (token: string, qs = "") =>
  request(app).get(`${URL}${qs}`).set("authorization", `Bearer ${token}`);

describe("GET /api/v1/me/visible-notes", () => {
  it("gives a MENTOR the mentors-visible note and not the admins or leaders ones", async () => {
    const res = await get(f.mentorToken);
    expect(res.status).toBe(200);
    const ids = res.body.data.notes.map((n: { id: number }) => n.id);
    expect(ids).toContain(f.mentorsNoteId);
    expect(ids).not.toContain(f.adminsNoteId);
    expect(ids).not.toContain(f.leadersNoteId);
    expect(JSON.stringify(res.body)).not.toContain("admins-only");
  });

  it("audits a feed read with ids and a count only, never a body or a name", async () => {
    // The route writes one JSON line through console.info.
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      const res = await get(f.mentorToken);
      expect(res.status).toBe(200);
      const lines = info.mock.calls
        .map((c) => String(c[0]))
        .filter((l) => l.includes("note_feed_read"));
      expect(lines).toHaveLength(1);
      const line = lines[0] as string;
      const entry = JSON.parse(line) as Record<string, unknown>;
      expect(Object.keys(entry).sort()).toEqual(["at", "event", "noteCount", "viewerId"]);
      expect(entry.noteCount).toBe(res.body.data.notes.length);
      expect(typeof entry.viewerId).toBe("number");
      for (const n of res.body.data.notes as { body: string; student: { name: string } }[]) {
        expect(line).not.toContain(n.body);
        expect(line).not.toContain(n.student.name);
      }
      expect(line).not.toContain("space-v2-test");
    } finally {
      info.mockRestore();
    }
  });

  it("carries the student on every row, newest first", async () => {
    const res = await get(f.mentorToken);
    const notes = res.body.data.notes as {
      id: number;
      createdAt: string;
      student: { id: number };
    }[];
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(n.student.id).toBe(f.studentUserId);
    const times = notes.map((n) => Date.parse(n.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("pages with limit and a nextCursor", async () => {
    const other = await createTestUser("note-visible-subject", "STUDENT");
    const mentor = await db.user.findFirstOrThrow({
      where: { email: { contains: "note-mentor" } },
      select: { id: true },
    });
    await db.engagementNote.create({
      data: {
        studentUserId: other.id,
        authorUserId: mentor.id,
        body: "<p>space-v2-test second</p>",
        visibility: "MENTORS",
      },
    });
    const first = await get(f.mentorToken, "?limit=1");
    expect(first.status).toBe(200);
    expect(first.body.data.notes).toHaveLength(1);
    expect(first.body.data.nextCursor).toEqual(expect.any(String));
    const second = await get(f.mentorToken, `?limit=1&cursor=${first.body.data.nextCursor}`);
    expect(second.body.data.notes[0].id).not.toBe(first.body.data.notes[0].id);
  });

  it("drops the notes of a soft-deleted student", async () => {
    const gone = await createTestUser("note-visible-gone", "STUDENT");
    const mentor = await db.user.findFirstOrThrow({
      where: { email: { contains: "note-mentor" } },
      select: { id: true },
    });
    const note = await db.engagementNote.create({
      data: {
        studentUserId: gone.id,
        authorUserId: mentor.id,
        body: "<p>space-v2-test gone</p>",
        visibility: "MENTORS",
      },
      select: { id: true },
    });
    let ids = (await get(f.mentorToken, "?limit=50")).body.data.notes.map((n: { id: number }) => n.id);
    expect(ids).toContain(note.id);
    await db.user.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    ids = (await get(f.mentorToken, "?limit=50")).body.data.notes.map((n: { id: number }) => n.id);
    expect(ids).not.toContain(note.id);
  });

  it.each([
    ["SUPER", () => f.superToken],
    ["ADMIN", () => f.adminToken],
    ["LEADER", () => f.insideLeaderToken],
    ["STUDENT", () => f.studentToken],
  ])("refuses %s with 403", async (_role, token) => {
    const res = await get(token());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("refuses no token with 401", async () => {
    expect((await request(app).get(URL)).status).toBe(401);
  });

  it("rejects limit=0 with 400", async () => {
    const res = await get(f.mentorToken, "?limit=0");
    expect(res.status).toBe(400);
  });
});
