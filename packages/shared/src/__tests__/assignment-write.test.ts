import {
  assignmentDeletedResponseSchema,
  assignmentDetailSchema,
  assignmentWriteRequestSchema,
  createAssignmentRequestSchema,
  isoDaySchema,
  updateAssignmentRequestSchema,
  wallTimeSchema,
} from "../index";

const video = {
  kind: "VIDEO",
  title: "Talk",
  youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
  blockSkipping: false,
  durationSeconds: 600,
};
const essay = {
  kind: "ESSAY",
  prompt: "Reflect",
  minWords: 100,
  maxWords: 300,
  maxFileSizeMb: null,
  allowedMimeCategories: [],
};
const forum = { kind: "FORUM", prompt: "Discuss", minWords: null, postToRead: true, allowComments: false };
const reminder = { enabled: true, days: 2, anchor: "NEXT_SESSION", time: "09:00" };
const valid = {
  title: "Week 4 reflection",
  description: null,
  dueDay: null,
  dueTime: null,
  reminder,
  parts: [video, essay, forum],
};

const firstMessage = (body: unknown) => {
  const r = assignmentWriteRequestSchema.safeParse(body);
  return r.success ? null : r.error.issues[0]?.message;
};

describe("isoDaySchema / wallTimeSchema (org wall clock on the wire, ruling C2)", () => {
  it("accepts a real calendar day and refuses shapes and impossible days", () => {
    expect(isoDaySchema.safeParse("2099-04-01").success).toBe(true);
    expect(isoDaySchema.safeParse("2099-4-1").success).toBe(false);
    expect(isoDaySchema.safeParse("2099-02-31").success).toBe(false);
    expect(isoDaySchema.safeParse("2099-04-01T00:00:00Z").success).toBe(false);
  });

  it("accepts 24-hour HH:mm only", () => {
    expect(wallTimeSchema.safeParse("23:59").success).toBe(true);
    expect(wallTimeSchema.safeParse("00:00").success).toBe(true);
    expect(wallTimeSchema.safeParse("24:00").success).toBe(false);
    expect(wallTimeSchema.safeParse("9:05").success).toBe(false);
  });
});

describe("assignmentWriteRequestSchema", () => {
  it("is the one body for create and update, and seasonId is never part of it (R68)", () => {
    expect(createAssignmentRequestSchema).toBe(assignmentWriteRequestSchema);
    expect(updateAssignmentRequestSchema).toBe(assignmentWriteRequestSchema);
    expect(assignmentWriteRequestSchema.parse({ ...valid, seasonId: 99 })).not.toHaveProperty("seasonId");
  });

  it("accepts video, essay and forum parts together", () => {
    expect(assignmentWriteRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses two forums", () => {
    expect(firstMessage({ ...valid, parts: [forum, forum] })).toBe("One forum per assignment");
  });

  it("refuses zero parts", () => {
    expect(firstMessage({ ...valid, parts: [] })).toBe("Add at least one part");
  });

  it("needs a due date for a due-date reminder", () => {
    expect(firstMessage({ ...valid, reminder: { ...reminder, anchor: "DUE_DATE" } })).toBe("Set a due date first");
    expect(
      assignmentWriteRequestSchema.safeParse({
        ...valid,
        dueDay: "2099-04-01",
        reminder: { ...reminder, anchor: "DUE_DATE" },
      }).success,
    ).toBe(true);
  });

  it("refuses an essay whose minimum is above its maximum", () => {
    expect(firstMessage({ ...valid, parts: [{ ...essay, minWords: 300, maxWords: 150 }] })).toBe(
      "The minimum is more than the maximum",
    );
  });

  it("refuses a link that is not YouTube", () => {
    expect(firstMessage({ ...valid, parts: [{ ...video, youtubeUrl: "https://example.com/x" }] })).toBe(
      "That isn't a YouTube link",
    );
  });

  it("bounds a video's duration to 1..43200 seconds and the reminder to 1..14 days", () => {
    expect(
      assignmentWriteRequestSchema.safeParse({ ...valid, parts: [{ ...video, durationSeconds: 0 }] }).success,
    ).toBe(false);
    expect(
      assignmentWriteRequestSchema.safeParse({ ...valid, parts: [{ ...video, durationSeconds: 43201 }] }).success,
    ).toBe(false);
    expect(assignmentWriteRequestSchema.safeParse({ ...valid, reminder: { ...reminder, days: 15 } }).success).toBe(
      false,
    );
  });

  it("bounds title at 2..160 (R1, R18)", () => {
    expect(assignmentWriteRequestSchema.safeParse({ ...valid, title: "x" }).success).toBe(false);
    expect(assignmentWriteRequestSchema.safeParse({ ...valid, title: "x".repeat(161) }).success).toBe(false);
  });

  it("no longer takes targeting, a session, or a device-composed instant", () => {
    const parsed = assignmentWriteRequestSchema.parse({
      ...valid,
      groupIds: [1],
      sessionId: 2,
      type: "FORUM",
      dueAt: "x",
    });
    for (const k of ["groupIds", "sessionId", "type", "dueAt"]) expect(parsed).not.toHaveProperty(k);
  });
});

describe("response additions", () => {
  const detail = {
    id: 41,
    seasonId: 7,
    seasonCode: "s7",
    seasonTitle: "Spring 2099",
    title: "Essay one",
    description: null,
    dueAt: "2099-04-01T21:59:00.000Z",
    dueOrgDay: "2099-04-01",
    dueOrgTime: "23:59",
    isOverdue: false,
    reminder,
    reminderLine: "2 days before the next session",
    parts: [
      { ...video, id: 1, position: 0, videoId: "dQw4w9WgXcQ" },
      { ...essay, id: 2, position: 1 },
    ],
    my: null,
    canManage: true,
    readOnly: false,
  };

  it("requires the server-derived org due fields on the detail (C4)", () => {
    expect(assignmentDetailSchema.safeParse(detail).success).toBe(true);
    const { dueOrgDay: _day, ...missing } = detail;
    expect(assignmentDetailSchema.safeParse(missing).success).toBe(false);
  });

  it("parses the delete response", () => {
    expect(assignmentDeletedResponseSchema.parse({ deleted: true })).toEqual({ deleted: true });
    expect(assignmentDeletedResponseSchema.safeParse({ deleted: false }).success).toBe(false);
  });
});
