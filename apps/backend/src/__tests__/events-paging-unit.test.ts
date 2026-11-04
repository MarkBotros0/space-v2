/**
 * GET /events?paged=true (owner decision): opt-in cursor paging, newest first,
 * against a mocked database — and the unpaged form the calendars and the
 * dashboards read, unchanged.
 */
const mockDb = {
  jpcEvent: { findMany: jest.fn(), count: jest.fn() },
};
jest.mock("../db/client", () => ({ db: mockDb }));
jest.mock("../lib/auth/session-validity", () => ({ isAccessTokenInvalidated: async () => false }));

import request from "supertest";

import { createApp } from "../app";
import { signAccessToken } from "../lib/auth/tokens";
import { encodeEventCursor, eventCursorFilter } from "../lib/queries/events";

const app = createApp();
let token: string;

beforeAll(async () => {
  ({ token } = await signAccessToken({
    userId: 1, role: "SUPER", seasonAdminIds: [], groupLeaderIds: [],
    activeSeasonId: null, graduationYear: null,
  }));
});

const row = (id: number, iso: string) => ({
  id,
  title: `Event ${id}`,
  date: new Date(iso),
  endDate: null,
  url: null,
  visibility: "ALL",
  seasonId: null,
  season: null,
});

/** n rows, newest first, one day apart. */
const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => row(100 - i, new Date(Date.UTC(2099, 0, 31 - i, 12)).toISOString()));

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.jpcEvent.count.mockResolvedValue(40);
});

const get = (qs: string) =>
  request(app).get(`/api/v1/events${qs}`).set({ authorization: `Bearer ${token}` });

describe("event cursor", () => {
  it("round-trips: the filter starts strictly after the encoded row", () => {
    const date = new Date("2099-01-05T12:00:00.000Z");
    const cursor = encodeEventCursor({ date, id: 42 });
    expect(cursor).toBe(`${date.getTime()}_42`);
    expect(eventCursorFilter(cursor)).toEqual({
      OR: [{ date: { lt: date } }, { date, id: { lt: 42 } }],
    });
  });
});

describe("GET /events?paged=true", () => {
  it("serves 25 newest first by default, with a cursor to the next page and the window total", async () => {
    mockDb.jpcEvent.findMany.mockResolvedValue(rows(26));
    const res = await get("?paged=true");
    expect(res.status).toBe(200);

    const args = mockDb.jpcEvent.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ date: "desc" }, { id: "desc" }]);
    expect(args.take).toBe(26);
    expect(res.body.data.events).toHaveLength(25);
    expect(res.body.data.total).toBe(40);
    const last = rows(25)[24]!;
    expect(res.body.data.nextCursor).toBe(`${last.date.getTime()}_${last.id}`);
  });

  it("answers nextCursor null on the last page", async () => {
    mockDb.jpcEvent.findMany.mockResolvedValue(rows(3));
    const res = await get("?paged=true&pageSize=5");
    expect(mockDb.jpcEvent.findMany.mock.calls[0][0].take).toBe(6);
    expect(res.body.data.events).toHaveLength(3);
    expect(res.body.data.nextCursor).toBeNull();
  });

  it("continues after the cursor, and counts the total without it", async () => {
    mockDb.jpcEvent.findMany.mockResolvedValue([]);
    const ms = Date.UTC(2099, 0, 7, 12);
    await get(`?paged=true&cursor=${ms}_76`);
    const { where } = mockDb.jpcEvent.findMany.mock.calls[0][0];
    expect(where.AND[1]).toEqual({
      OR: [{ date: { lt: new Date(ms) } }, { date: new Date(ms), id: { lt: 76 } }],
    });
    expect(mockDb.jpcEvent.count.mock.calls[0][0].where).toEqual(where.AND[0]);
  });

  it("keeps the window filters: upcoming narrows the paged list too", async () => {
    mockDb.jpcEvent.findMany.mockResolvedValue([]);
    const res = await get("?paged=true&upcoming=true");
    expect(res.status).toBe(200);
    const window = mockDb.jpcEvent.findMany.mock.calls[0][0].where.AND[1];
    expect(window.AND).toHaveLength(1);
  });

  it.each([
    ["a malformed cursor", "?paged=true&cursor=abc"],
    ["a cursor without paged", "?cursor=1_2"],
    ["pageSize without paged", "?pageSize=10"],
    ["limit with paged", "?paged=true&limit=5"],
    ["a pageSize over 100", "?paged=true&pageSize=101"],
  ])("answers 400 for %s", async (_label, qs) => {
    const res = await get(qs);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    expect(mockDb.jpcEvent.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /events unpaged (calendars, dashboards) is unchanged", () => {
  it("returns every visible event oldest first with no cursor field", async () => {
    mockDb.jpcEvent.findMany.mockResolvedValue(rows(30).reverse());
    const res = await get("");
    const args = mockDb.jpcEvent.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ date: "asc" }, { id: "asc" }]);
    expect(args.take).toBeUndefined();
    expect(res.body.data.events).toHaveLength(30);
    expect(res.body.data).not.toHaveProperty("nextCursor");
  });

  it("still caps with limit for the dashboard card", async () => {
    mockDb.jpcEvent.findMany.mockResolvedValue([]);
    await get("?upcoming=true&limit=4");
    expect(mockDb.jpcEvent.findMany.mock.calls[0][0].take).toBe(4);
  });
});
