import {
  createAnnouncementRequestSchema,
  updateAnnouncementRequestSchema,
  NOTIFICATION_PREFERENCE_KEYS,
  shouldPush,
} from "../index";

describe("announcement contracts", () => {
  const ok = { audience: "COMMUNITY", title: "Hello", body: "World" };

  it("accepts valid community and season posts and trims", () => {
    expect(createAnnouncementRequestSchema.parse({ ...ok, title: "  Hi  " }).title).toBe("Hi");
    expect(
      createAnnouncementRequestSchema.safeParse({ audience: "SEASON", seasonId: 3, title: "t", body: "b" }).success,
    ).toBe(true);
  });

  it("rejects a 121-char title and accepts 120", () => {
    expect(createAnnouncementRequestSchema.safeParse({ ...ok, title: "a".repeat(121) }).success).toBe(false);
    expect(createAnnouncementRequestSchema.safeParse({ ...ok, title: "a".repeat(120) }).success).toBe(true);
  });

  it("rejects an empty-after-trim body and a 5001-char body", () => {
    expect(createAnnouncementRequestSchema.safeParse({ ...ok, body: "   " }).success).toBe(false);
    expect(createAnnouncementRequestSchema.safeParse({ ...ok, body: "a".repeat(5001) }).success).toBe(false);
    expect(createAnnouncementRequestSchema.safeParse({ ...ok, body: "a".repeat(5000) }).success).toBe(true);
  });

  it("requires seasonId for SEASON and forbids it for COMMUNITY", () => {
    expect(createAnnouncementRequestSchema.safeParse({ audience: "SEASON", title: "t", body: "b" }).success).toBe(false);
    expect(createAnnouncementRequestSchema.safeParse({ ...ok, seasonId: 3 }).success).toBe(false);
  });

  it("update schema needs at least one key and is strict", () => {
    expect(updateAnnouncementRequestSchema.safeParse({}).success).toBe(false);
    expect(updateAnnouncementRequestSchema.safeParse({ title: "x" }).success).toBe(true);
    expect(updateAnnouncementRequestSchema.safeParse({ title: "x", audience: "SEASON" }).success).toBe(false);
  });

  it("registers the announcement preference and push", () => {
    expect(NOTIFICATION_PREFERENCE_KEYS).toContain("announcement");
    expect(shouldPush("ANNOUNCEMENT")).toBe(true);
  });
});
