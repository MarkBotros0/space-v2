import { db } from "../../db/client";
import { TEST_PREFIX } from "./fixtures";

jest.setTimeout(60000);

afterAll(async () => {
  await db.$disconnect();
});

/**
 * Every integration suite cleans up in its own afterAll, so between suites —
 * and after the full run — the shared staging database must hold no prefixed
 * row. Case-insensitive on purpose: the imports suite pastes uppercase
 * variants of fixture addresses, and cleanupTestData's own filter is
 * case-sensitive.
 */
describe("no test fixture survives cleanup", () => {
  it("leaves zero prefixed users and seasons", async () => {
    const users = await db.user.count({
      where: { email: { startsWith: TEST_PREFIX, mode: "insensitive" } },
    });
    const seasons = await db.season.count({ where: { code: { startsWith: TEST_PREFIX } } });
    expect({ users, seasons }).toEqual({ users: 0, seasons: 0 });
  });
});
