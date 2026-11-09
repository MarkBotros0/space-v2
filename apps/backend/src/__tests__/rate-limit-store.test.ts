const mockDb = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
jest.mock("../db/client", () => ({ db: mockDb }));
const mockRunInBackground = jest.fn();
jest.mock("../lib/background", () => ({
  runInBackground: (...args: unknown[]) => mockRunInBackground(...args),
}));

import type { Options } from "express-rate-limit";

import { PostgresStore } from "../lib/rate-limit/postgres-store";

/** The SQL text of a tagged-template call, placeholders as `?`. */
function sqlOf(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
}

function makeStore(random = () => 0.5) {
  const store = new PostgresStore("auth", { client: mockDb as never, random });
  store.init({ windowMs: 15 * 60 * 1000 } as Options);
  return store;
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe("PostgresStore", () => {
  it("prefixes keys with the limiter name and shares counters across instances", () => {
    const store = makeStore();
    expect(store.prefix).toBe("auth:");
    expect(store.localKeys).toBe(false);
  });

  it("increment is one atomic upsert and returns the row's hits and reset time", async () => {
    const resetAt = new Date("2026-11-05T13:15:00.000Z");
    mockDb.$queryRaw.mockResolvedValue([{ hits: 3, resetAt }]);

    const info = await makeStore().increment("203.0.113.7");

    expect(info).toEqual({ totalHits: 3, resetTime: resetAt });
    expect(mockDb.$queryRaw).toHaveBeenCalledTimes(1);
    const call = mockDb.$queryRaw.mock.calls[0] as unknown[];
    const sql = sqlOf(call);
    expect(sql).toContain('INSERT INTO "RateLimitHit"');
    expect(sql).toContain('ON CONFLICT ("key") DO UPDATE');
    expect(sql).toContain('WHEN "RateLimitHit"."resetAt" <= now() THEN 1');
    expect(sql).toContain('RETURNING "hits", "resetAt"');
    expect(call.slice(1)).toEqual(["auth:203.0.113.7", 15 * 60 * 1000]);
  });

  it("coerces a bigint count and a string timestamp", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ hits: BigInt(7), resetAt: "2026-11-05T13:15:00.000Z" }]);
    const info = await makeStore().increment("k");
    expect(info.totalHits).toBe(7);
    expect(info.resetTime?.toISOString()).toBe("2026-11-05T13:15:00.000Z");
  });

  it("uses the window express-rate-limit passes to init", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ hits: 1, resetAt: new Date() }]);
    const store = new PostgresStore("bulk-invite", { client: mockDb as never, random: () => 1 });
    store.init({ windowMs: 60 * 60 * 1000 } as Options);
    await store.increment("9");
    expect((mockDb.$queryRaw.mock.calls[0] as unknown[]).slice(1)).toEqual(["bulk-invite:9", 60 * 60 * 1000]);
  });

  it("passes a database error through so express-rate-limit can decide", async () => {
    mockDb.$queryRaw.mockRejectedValue(new Error("connection refused"));
    await expect(makeStore().increment("k")).rejects.toThrow("connection refused");
  });

  it("throws when the upsert returns no row", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    await expect(makeStore().increment("k")).rejects.toThrow(/no row/);
  });

  it("decrement lowers the live row, never below zero", async () => {
    mockDb.$executeRaw.mockResolvedValue(1);
    await makeStore().decrement("k");
    const call = mockDb.$executeRaw.mock.calls[0] as unknown[];
    expect(sqlOf(call)).toContain('SET "hits" = GREATEST("hits" - 1, 0)');
    expect(sqlOf(call)).toContain('"resetAt" > now()');
    expect(call.slice(1)).toEqual(["auth:k"]);
  });

  it("resetKey deletes the prefixed row", async () => {
    mockDb.$executeRaw.mockResolvedValue(1);
    await makeStore().resetKey("k");
    const call = mockDb.$executeRaw.mock.calls[0] as unknown[];
    expect(sqlOf(call)).toContain('DELETE FROM "RateLimitHit" WHERE "key" = ?');
    expect(call.slice(1)).toEqual(["auth:k"]);
  });

  it("get returns a live row and undefined when there is none", async () => {
    const resetAt = new Date("2026-11-05T13:15:00.000Z");
    mockDb.$queryRaw.mockResolvedValueOnce([{ hits: 2, resetAt }]).mockResolvedValueOnce([]);
    const store = makeStore();
    expect(await store.get("k")).toEqual({ totalHits: 2, resetTime: resetAt });
    expect(await store.get("k")).toBeUndefined();
  });

  it("sweeps expired rows in the background on about 1% of increments", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ hits: 1, resetAt: new Date() }]);
    mockDb.$executeRaw.mockResolvedValue(0);

    await makeStore(() => 0.5).increment("k");
    expect(mockRunInBackground).not.toHaveBeenCalled();

    await makeStore(() => 0.001).increment("k");
    expect(mockRunInBackground).toHaveBeenCalledTimes(1);
    expect(mockRunInBackground.mock.calls[0][0]).toBe("rate-limit-cleanup");
    await mockRunInBackground.mock.calls[0][1];
    const sweep = mockDb.$executeRaw.mock.calls[0] as unknown[];
    expect(sqlOf(sweep)).toContain(`WHERE "resetAt" < now() - interval '1 hour'`);
  });
});
