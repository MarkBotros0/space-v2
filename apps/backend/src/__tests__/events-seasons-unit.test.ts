/**
 * Events list window (v1 parity, audit R57 REVERT), the live-season check on
 * event writes, and the season duplicate's batching and transaction timeout —
 * all against a mocked database.
 */
const mockDb = {
  jpcEvent: { findMany: jest.fn(), count: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  season: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
  group: { create: jest.fn(), createMany: jest.fn() },
  session: { create: jest.fn(), createMany: jest.fn() },
  assignment: { create: jest.fn() },
  assignmentTarget: { createMany: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock("../db/client", () => ({ db: mockDb }));
// requireAuth's Plan 18 M13 check reads User.sessionsValidFrom; no session
// has been invalidated in this suite.
jest.mock("../lib/auth/session-validity", () => ({ isAccessTokenInvalidated: async () => false }));

import request from "supertest";

import { createApp } from "../app";
import { signAccessToken } from "../lib/auth/tokens";
import { eventWindowFilter } from "../lib/queries/events";

const app = createApp();
let token: string;

beforeAll(async () => {
  ({ token } = await signAccessToken({
    userId: 1, role: "SUPER", seasonAdminIds: [], groupLeaderIds: [],
    activeSeasonId: null, graduationYear: null,
  }));
});

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.$transaction.mockImplementation((fn: (tx: typeof mockDb) => unknown) => fn(mockDb));
});

const auth = () => ({ authorization: `Bearer ${token}` });

describe("eventWindowFilter", () => {
  it("leaves a missing bound open", () => {
    expect(eventWindowFilter(null, null)).toEqual({ AND: [] });
    const to = new Date("2030-01-01T00:00:00Z");
    expect(eventWindowFilter(null, to)).toEqual({ AND: [{ date: { lte: to } }] });
  });

  it("windows on (endDate ?? date) from the lower bound", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    expect(eventWindowFilter(from, null)).toEqual({
      AND: [{ OR: [{ endDate: { gte: from } }, { endDate: null, date: { gte: from } }] }],
    });
  });
});

describe("GET /events", () => {
  it("with no from/to returns every visible event — no -30d/+365d default (R57 REVERT)", async () => {
    mockDb.jpcEvent.findMany.mockResolvedValue([]);
    mockDb.jpcEvent.count.mockResolvedValue(0);
    const res = await request(app).get("/api/v1/events").set(auth());
    expect(res.status).toBe(200);
    // SUPER: visibility is {}, and the window adds no bound.
    expect(mockDb.jpcEvent.findMany.mock.calls[0][0].where).toEqual({ AND: [{}, { AND: [] }] });
  });
});

describe("event writes refuse a soft-deleted season", () => {
  const body = { title: "Retreat", day: "2026-05-01", visibility: "SEASON", seasonId: 4 };

  it("POST checks deletedAt", async () => {
    mockDb.season.findFirst.mockResolvedValue(null);
    const res = await request(app).post("/api/v1/events").set(auth()).send(body);
    expect(res.status).toBe(400);
    expect(mockDb.season.findFirst).toHaveBeenCalledWith({
      where: { id: 4, deletedAt: null },
      select: { id: true },
    });
    expect(mockDb.jpcEvent.create).not.toHaveBeenCalled();
  });

  it("PATCH checks only a newly attached season, so an event on a since-deleted season stays editable", async () => {
    const stored = {
      id: 9, title: "Retreat", date: new Date("2026-05-01T00:00:00Z"), endDate: null, url: null,
      visibility: "SEASON", seasonId: 3, season: { code: "old", title: "Old" }, description: null,
    };
    mockDb.jpcEvent.findUnique.mockResolvedValue(stored);
    mockDb.jpcEvent.update.mockResolvedValue(stored);

    const rename = await request(app).patch("/api/v1/events/9").set(auth()).send({ title: "Renamed" });
    expect(rename.status).toBe(200);
    expect(mockDb.season.findFirst).not.toHaveBeenCalled();

    mockDb.season.findFirst.mockResolvedValue(null);
    const move = await request(app).patch("/api/v1/events/9").set(auth()).send({ seasonId: 4 });
    expect(move.status).toBe(400);
    expect(mockDb.season.findFirst).toHaveBeenCalledWith({ where: { id: 4, deletedAt: null }, select: { id: true } });
  });
});

describe("POST /seasons/:id/duplicate", () => {
  it("batches what needs no id mapping and runs under a 30 s transaction timeout", async () => {
    mockDb.season.findFirst.mockResolvedValue({
      program: "GBV", description: null, startDate: new Date("2026-01-01T00:00:00Z"),
      absenceBudgetMinutes: 180, absenceWeightMinutes: 90,
      groups: [
        { id: 1, name: "A", description: null },
        { id: 2, name: "B", description: null },
        { id: 3, name: "C", description: null },
      ],
      sessions: [
        { id: 10, title: "S1", startsAt: new Date("2026-01-05T18:00:00Z"), durationMinutes: 90, location: null, youtubeUrl: null, description: null, recurrenceGroupId: "r1" },
        { id: 11, title: "S2", startsAt: new Date("2026-01-12T18:00:00Z"), durationMinutes: 90, location: null, youtubeUrl: null, description: null, recurrenceGroupId: "r1" },
        { id: 12, title: "S3", startsAt: new Date("2026-01-19T18:00:00Z"), durationMinutes: 90, location: null, youtubeUrl: null, description: null, recurrenceGroupId: null },
      ],
      assignments: [
        {
          title: "Essay", description: null, dueAt: null, isAllGroups: false, type: "FILE",
          forumMinWords: null, forumAllowComments: true, maxFileSizeMb: 10, allowedMimeCategories: [],
          sessionId: 11, targets: [{ groupId: 2 }, { groupId: 99 }],
        },
      ],
    });
    mockDb.season.findUnique.mockResolvedValue(null);
    mockDb.season.create.mockResolvedValue({ id: 70, code: "gbv-2027" });
    mockDb.group.create.mockResolvedValue({ id: 200 });
    mockDb.session.create.mockResolvedValue({ id: 300 });
    mockDb.assignment.create.mockResolvedValue({ id: 400 });

    const res = await request(app)
      .post("/api/v1/seasons/5/duplicate")
      .set(auth())
      .send({ year: 2027, startDate: "2027-01-01T00:00:00.000Z", endDate: "2027-12-31T00:00:00.000Z" });
    expect(res.status).toBe(201);

    expect(mockDb.$transaction.mock.calls[0][1]).toEqual({ timeout: 30_000 });
    // Groups A and C are targeted by nothing: one createMany. B is created alone.
    expect(mockDb.group.createMany.mock.calls[0][0].data.map((g: { name: string }) => g.name)).toEqual(["A", "C"]);
    expect(mockDb.group.create).toHaveBeenCalledTimes(1);
    // Only S2 is linked from an assignment.
    expect(mockDb.session.createMany.mock.calls[0][0].data.map((s: { title: string }) => s.title)).toEqual(["S1", "S3"]);
    expect(mockDb.session.create).toHaveBeenCalledTimes(1);
    // One series in, one FRESH series id out, shared by both its clones.
    const s1 = mockDb.session.createMany.mock.calls[0][0].data[0].recurrenceGroupId;
    const s2 = mockDb.session.create.mock.calls[0][0].data.recurrenceGroupId;
    expect(s1).toBe(s2);
    expect(s1).not.toBe("r1");
    expect(mockDb.assignment.create.mock.calls[0][0].data.sessionId).toBe(300);
    // R60: the unmappable target (group 99) is dropped; the rest in one createMany.
    expect(mockDb.assignmentTarget.createMany).toHaveBeenCalledTimes(1);
    expect(mockDb.assignmentTarget.createMany.mock.calls[0][0].data).toEqual([{ assignmentId: 400, groupId: 200 }]);
  });
});
