import type { AssignmentDetail } from "@space/shared";

import { NEW_ASSIGNMENT_VALUES, toAssignmentBody, valuesFromDetail } from "../lib/assignment-form-values";

const detail: AssignmentDetail = {
  id: 41,
  seasonId: 7,
  seasonCode: "s7",
  seasonTitle: "Spring 2099",
  title: "Luke 15",
  description: "Read and watch",
  dueAt: "2099-04-01T21:59:00.000Z",
  dueOrgDay: "2099-04-01",
  dueOrgTime: "23:59",
  isOverdue: false,
  reminder: { enabled: true, days: 3, anchor: "DUE_DATE", time: "18:00" },
  reminderLine: null,
  parts: [
    {
      id: 12,
      position: 0,
      kind: "ESSAY",
      prompt: "What did the father do?",
      minWords: 100,
      maxWords: null,
      maxFileSizeMb: 10,
      allowedMimeCategories: ["pdf"],
    },
    {
      id: 11,
      position: 1,
      kind: "VIDEO",
      title: "Luke 15 talk",
      youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
      videoId: "dQw4w9WgXcQ",
      blockSkipping: true,
      durationSeconds: 1080,
    },
    {
      id: 13,
      position: 2,
      kind: "FORUM",
      prompt: "Discuss",
      minWords: 50,
      postToRead: true,
      allowComments: false,
    },
  ],
  my: null,
  canManage: true,
  readOnly: false,
};

describe("NEW_ASSIGNMENT_VALUES", () => {
  it("defaults the reminder to on, 2 days before the next session at 09:00, with no parts", () => {
    expect(NEW_ASSIGNMENT_VALUES.reminder).toEqual({ enabled: true, days: 2, anchor: "NEXT_SESSION", time: "09:00" });
    expect(NEW_ASSIGNMENT_VALUES.parts).toEqual([]);
    expect(NEW_ASSIGNMENT_VALUES.dueTime).toBe("23:59");
  });

  it("refuses to save with no part", () => {
    const parsed = toAssignmentBody({ ...NEW_ASSIGNMENT_VALUES, title: "Luke 15" });
    expect(parsed.success).toBe(false);
  });
});

describe("toAssignmentBody", () => {
  it("keeps part order and ids", () => {
    const parsed = toAssignmentBody(valuesFromDetail(detail));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.parts.map((p) => [p.kind, p.id])).toEqual([
      ["ESSAY", 12],
      ["VIDEO", 11],
      ["FORUM", 13],
    ]);
    // A reader's fields never go back to the server.
    expect(parsed.data.parts[1]).not.toHaveProperty("position");
    expect(parsed.data.parts[1]).not.toHaveProperty("videoId");
    expect(parsed.data.parts[1]).not.toHaveProperty("key");
  });

  it("sends the details, the reminder and a new part without an id", () => {
    const values = valuesFromDetail(detail);
    const added = {
      key: "new-1",
      kind: "FORUM" as const,
      prompt: "Another",
      minWords: null,
      postToRead: false,
      allowComments: true,
    };
    const parsed = toAssignmentBody({ ...values, title: "  Luke 15  ", parts: [values.parts[0]!, added] });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      title: "Luke 15",
      description: "Read and watch",
      dueDay: "2099-04-01",
      dueTime: "23:59",
      reminder: { enabled: true, days: 3, anchor: "DUE_DATE", time: "18:00" },
    });
    expect(parsed.data.parts[1]).toEqual({
      kind: "FORUM",
      prompt: "Another",
      minWords: null,
      postToRead: false,
      allowComments: true,
    });
  });

  it("drops the due time with the due date", () => {
    const values = {
      ...valuesFromDetail(detail),
      dueDay: null,
      reminder: { ...detail.reminder, anchor: "NEXT_SESSION" as const },
    };
    const parsed = toAssignmentBody(values);
    expect(parsed.success && parsed.data.dueTime).toBeNull();
  });
});

describe("valuesFromDetail", () => {
  it("pre-fills from the org clock fields and gives every part a stable key", () => {
    const values = valuesFromDetail(detail);
    expect(values.dueDay).toBe("2099-04-01");
    expect(values.dueTime).toBe("23:59");
    expect(values.parts.map((p) => p.key)).toEqual(["part-12", "part-11", "part-13"]);
  });
});
