import { assignmentWriteRequestSchema, type Reminder } from "@space/shared";

import { formIssues, reminderPreview } from "../screens/assignment-form/assignment-form-model";

const on: Reminder = { enabled: true, days: 2, anchor: "NEXT_SESSION", time: "09:00" };
// Wed 1 Apr 2099, 08:00 on this device.
const now = new Date(2099, 3, 1, 8, 0);

describe("reminderPreview", () => {
  it("says the rule for the next session, which only the server can date", () => {
    expect(reminderPreview({ reminder: on, dueDay: null, dueTime: "23:59" }, null, now)).toBe(
      "2 days before the next session, around 9:00 AM — students who haven't finished",
    );
    expect(reminderPreview({ reminder: { ...on, days: 1 }, dueDay: null, dueTime: "23:59" }, null, now)).toBe(
      "1 day before the next session, around 9:00 AM — students who haven't finished",
    );
  });

  it("dates a due-date reminder from the form's due day", () => {
    const reminder: Reminder = { ...on, anchor: "DUE_DATE", days: 3, time: "18:30" };
    expect(reminderPreview({ reminder, dueDay: "2099-04-10", dueTime: "23:59" }, null, now)).toBe(
      "Tue 7 Apr, around 6:30 PM — students who haven't finished",
    );
    // Already gone by now.
    expect(reminderPreview({ reminder, dueDay: "2099-04-03", dueTime: "23:59" }, null, now)).toBe(
      "Too close to the due date — no reminder",
    );
    // No due date: the anchor field says "Set a due date first" instead.
    expect(reminderPreview({ reminder, dueDay: null, dueTime: "23:59" }, null, now)).toBeNull();
  });

  it("says so in words when the reminder is off", () => {
    expect(reminderPreview({ reminder: { ...on, enabled: false }, dueDay: null, dueTime: "23:59" }, null, now)).toBe(
      "No reminder goes out for this assignment.",
    );
  });

  it("shows the server's line while the saved settings are unchanged", () => {
    const saved = {
      reminder: on,
      dueDay: null,
      dueTime: "23:59",
      line: "Thu 9 Apr, around 9:00 AM — students who haven't finished",
    };
    expect(reminderPreview({ reminder: on, dueDay: null, dueTime: "23:59" }, saved, now)).toBe(saved.line);
    expect(reminderPreview({ reminder: { ...on, days: 4 }, dueDay: null, dueTime: "23:59" }, saved, now)).toBe(
      "4 days before the next session, around 9:00 AM — students who haven't finished",
    );
  });
});

describe("formIssues", () => {
  const parse = (body: unknown) => {
    const parsed = assignmentWriteRequestSchema.safeParse(body);
    if (parsed.success) throw new Error("expected a refusal");
    return parsed.error;
  };
  const base = { title: "Week 4", description: null, dueDay: null, dueTime: null, reminder: on };

  it("puts Details issues on Details and the parts' on Parts", () => {
    const issues = formIssues(parse({ ...base, title: "", parts: [] }), []);
    expect(issues.details.title).toBeTruthy();
    expect(issues.partsList).toBe("Add at least one part");
    expect(issues.tabs).toEqual({ details: 1, parts: 1 });
  });

  it("names the part by its key, and the anchor's issue for the reminder", () => {
    const forum = { kind: "FORUM", prompt: "", minWords: null, postToRead: true, allowComments: false } as const;
    const issues = formIssues(parse({ ...base, reminder: { ...on, anchor: "DUE_DATE" }, parts: [forum] }), [
      { ...forum, key: "k1" },
    ]);
    expect(issues.details.anchor).toBe("Set a due date first");
    expect(issues.byPart.k1).toBeTruthy();
    expect(issues.tabs).toEqual({ details: 1, parts: 1 });
  });
});
