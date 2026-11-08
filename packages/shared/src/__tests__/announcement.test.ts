import {
  createAnnouncementRequestSchema,
  updateAnnouncementRequestSchema,
  NOTIFICATION_PREFERENCE_KEYS,
  shouldPush,
} from "../index";

describe("announcement contracts", () => {
  const ok = { audience: "COMMUNITY", body: "World" };

  it("accepts valid community and season posts and trims", () => {
    expect(createAnnouncementRequestSchema.parse({ ...ok, body: "  Hi  " }).body).toBe("Hi");
    expect(createAnnouncementRequestSchema.safeParse({ audience: "SEASON", seasonId: 3, body: "b" }).success).toBe(true);
  });

  it("has no title: a post sending one is refused", () => {
    expect(createAnnouncementRequestSchema.safeParse({ ...ok, title: "Hello" }).success).toBe(false);
    expect(updateAnnouncementRequestSchema.safeParse({ body: "b", title: "x" }).success).toBe(false);
  });

  it("rejects an empty-after-trim body and a 5001-char body", () => {
    expect(createAnnouncementRequestSchema.safeParse({ ...ok, body: "   " }).success).toBe(false);
    expect(createAnnouncementRequestSchema.safeParse({ ...ok, body: "a".repeat(5001) }).success).toBe(false);
    expect(createAnnouncementRequestSchema.safeParse({ ...ok, body: "a".repeat(5000) }).success).toBe(true);
  });

  it("requires seasonId for SEASON and forbids it for COMMUNITY", () => {
    expect(createAnnouncementRequestSchema.safeParse({ audience: "SEASON", body: "b" }).success).toBe(false);
    expect(createAnnouncementRequestSchema.safeParse({ ...ok, seasonId: 3 }).success).toBe(false);
  });

  it("update schema needs the body and is strict", () => {
    expect(updateAnnouncementRequestSchema.safeParse({}).success).toBe(false);
    expect(updateAnnouncementRequestSchema.safeParse({ body: "x" }).success).toBe(true);
    expect(updateAnnouncementRequestSchema.safeParse({ body: "x", audience: "SEASON" }).success).toBe(false);
  });

  it("registers the announcement preference and push", () => {
    expect(NOTIFICATION_PREFERENCE_KEYS).toContain("announcement");
    expect(shouldPush("ANNOUNCEMENT")).toBe(true);
  });
});
