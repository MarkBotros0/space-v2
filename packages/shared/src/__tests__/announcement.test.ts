import {
  createAnnouncementRequestSchema,
  updateAnnouncementRequestSchema,
  pollInputSchema,
  pollVoteRequestSchema,
  NOTIFICATION_PREFERENCE_KEY_BY_TYPE,
  shouldPush,
  announcementPlainText,
  isHtmlBody,
  ANNOUNCEMENT_BODY_MAX,
} from "../index";

describe("a rich body (owner 2026-11-14: the announcement takes the instructions' editor)", () => {
  it("tells a rich body from an older plain one, and reads both as words", () => {
    expect(isHtmlBody("<p>Hi</p>")).toBe(true);
    expect(isHtmlBody("Hi <there>")).toBe(false);
    expect(announcementPlainText("<p><strong>Hi</strong></p><p>مرحبا</p>")).toBe("Hi\nمرحبا");
    expect(announcementPlainText("  plain  ")).toBe("plain");
  });

  it("limits the words, not the formatting, and refuses an empty paragraph", () => {
    const words = "a".repeat(ANNOUNCEMENT_BODY_MAX);
    const parse = (body: string) => createAnnouncementRequestSchema.safeParse({ audience: "COMMUNITY", body }).success;
    expect(parse(`<p><strong>${words}</strong></p>`)).toBe(true);
    expect(parse(`<p>${words}a</p>`)).toBe(false);
    expect(parse("<p></p>")).toBe(false);
  });
});

describe("announcement contracts", () => {
  const ok = { audience: "COMMUNITY", body: "World" };

  it("accepts valid community and season posts and trims", () => {
    expect(createAnnouncementRequestSchema.parse({ ...ok, body: "  Hi  " }).body).toBe("Hi");
    expect(createAnnouncementRequestSchema.safeParse({ audience: "SEASON", seasonId: 3, body: "b" }).success).toBe(
      true,
    );
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
    expect(NOTIFICATION_PREFERENCE_KEY_BY_TYPE.ANNOUNCEMENT).toBe("announcement");
    expect(shouldPush("ANNOUNCEMENT")).toBe(true);
  });
});

describe("announcement poll contracts", () => {
  const opts = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `Option ${i}` }));

  it("accepts 2 and 10 options and refuses 1 and 11", () => {
    expect(pollInputSchema.safeParse({ allowsMultiple: false, options: opts(2) }).success).toBe(true);
    expect(pollInputSchema.safeParse({ allowsMultiple: true, options: opts(10) }).success).toBe(true);
    expect(pollInputSchema.safeParse({ allowsMultiple: false, options: opts(1) }).success).toBe(false);
    expect(pollInputSchema.safeParse({ allowsMultiple: false, options: opts(11) }).success).toBe(false);
  });

  it("refuses a 151-char label and an empty-after-trim label", () => {
    const bad = (label: string) =>
      pollInputSchema.safeParse({ allowsMultiple: false, options: [{ label }, { label: "ok" }] }).success;
    expect(bad("a".repeat(151))).toBe(false);
    expect(bad("a".repeat(150))).toBe(true);
    expect(bad("   ")).toBe(false);
  });

  it("refuses duplicate labels ignoring case and spaces, at the later option", () => {
    const r = pollInputSchema.safeParse({ allowsMultiple: false, options: [{ label: "Sat" }, { label: " sat " }] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path.join(".") === "options.1.label")).toBe(true);
  });

  it("create refuses an option id; update accepts poll null or absent", () => {
    const poll = { allowsMultiple: false, options: [{ id: 4, label: "A" }, { label: "B" }] };
    expect(createAnnouncementRequestSchema.safeParse({ audience: "COMMUNITY", body: "b", poll }).success).toBe(false);
    expect(
      createAnnouncementRequestSchema.safeParse({
        audience: "COMMUNITY",
        body: "b",
        poll: { allowsMultiple: false, options: opts(2) },
      }).success,
    ).toBe(true);
    expect(updateAnnouncementRequestSchema.safeParse({ body: "x", poll: null }).success).toBe(true);
    expect(updateAnnouncementRequestSchema.safeParse({ body: "x" }).success).toBe(true);
    expect(updateAnnouncementRequestSchema.safeParse({ body: "x", poll, confirmVoteLoss: true }).success).toBe(true);
  });

  it("vote request needs at least one option", () => {
    expect(pollVoteRequestSchema.safeParse({ version: 1, optionIds: [] }).success).toBe(false);
    expect(pollVoteRequestSchema.safeParse({ version: 1, optionIds: [3] }).success).toBe(true);
  });
});
