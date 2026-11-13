import { isLate, remindAtFor, reminderBody, reminderLine } from "../lib/assignments/reminder";

// The org clock is Africa/Cairo (config default): UTC+2 in November 2025 (13 Nov 2025 is a Thursday).
const THU_13_NOV_SESSION = new Date("2025-11-13T16:00:00.000Z"); // 18:00 Cairo
const SAVED = new Date("2025-11-10T10:00:00.000Z");

describe("remindAtFor", () => {
  it("2 days before Thu 13 Nov at 09:00 Cairo is Tue 11 Nov 07:00Z", () => {
    const at = remindAtFor({
      anchor: "NEXT_SESSION",
      days: 2,
      time: "09:00",
      dueAt: null,
      nextSessionStartsAt: THU_13_NOV_SESSION,
      now: SAVED,
    });
    expect(at?.toISOString()).toBe("2025-11-11T07:00:00.000Z");
  });

  it("counts back from the due date's org day, not its UTC day", () => {
    // 00:30 Cairo on Fri 14 Nov is still Thu 13 Nov in UTC.
    const at = remindAtFor({
      anchor: "DUE_DATE",
      days: 1,
      time: "20:30",
      dueAt: new Date("2025-11-13T22:30:00.000Z"),
      nextSessionStartsAt: null,
      now: SAVED,
    });
    expect(at?.toISOString()).toBe("2025-11-13T18:30:00.000Z");
  });

  it("DUE_DATE without a due date is null", () => {
    const at = remindAtFor({
      anchor: "DUE_DATE",
      days: 2,
      time: "09:00",
      dueAt: null,
      nextSessionStartsAt: THU_13_NOV_SESSION,
      now: SAVED,
    });
    expect(at).toBeNull();
  });

  it("NEXT_SESSION without an upcoming session is null", () => {
    const at = remindAtFor({
      anchor: "NEXT_SESSION",
      days: 2,
      time: "09:00",
      dueAt: null,
      nextSessionStartsAt: null,
      now: SAVED,
    });
    expect(at).toBeNull();
  });

  it("a time already past is null", () => {
    const at = remindAtFor({
      anchor: "NEXT_SESSION",
      days: 2,
      time: "09:00",
      dueAt: null,
      nextSessionStartsAt: THU_13_NOV_SESSION,
      now: new Date("2025-11-11T07:00:00.000Z"),
    });
    expect(at).toBeNull();
  });
});

describe("reminderLine", () => {
  const on = { enabled: true, anchor: "NEXT_SESSION" as const, remindedAt: null, hasAnchor: true };

  it("says when it goes out, around the time", () => {
    expect(reminderLine(on, new Date("2025-11-11T07:00:00.000Z"))).toBe(
      "Tue 11 Nov, around 9:00 AM, to students who haven't finished",
    );
    expect(reminderLine(on, new Date("2025-11-11T13:30:00.000Z"))).toBe(
      "Tue 11 Nov, around 3:30 PM, to students who haven't finished",
    );
  });

  it("says there is no session after it was published, and null when off", () => {
    expect(reminderLine({ ...on, hasAnchor: false }, null)).toBe("No reminder: no session after it was published");
    expect(reminderLine({ ...on, enabled: false }, new Date())).toBeNull();
  });

  it("says when the anchor is too close, and when it was sent", () => {
    expect(reminderLine(on, null)).toBe("No reminder: the next session was too close");
    expect(reminderLine({ ...on, anchor: "DUE_DATE" }, null)).toBe("No reminder: too close to the due date");
    const sent = { ...on, remindedAt: new Date("2025-11-11T07:04:00.000Z") };
    expect(reminderLine(sent, new Date("2025-11-11T07:00:00.000Z"))).toBe("Sent Tue 11 Nov, around 9:00 AM");
  });
});

describe("reminderBody", () => {
  it("counts the parts left before the anchor's weekday", () => {
    const remindAt = new Date("2025-11-11T07:00:00.000Z"); // Tue, 2 days before Thursday
    expect(reminderBody(2, remindAt, 2)).toBe("2 parts left before Thursday");
    expect(reminderBody(1, remindAt, 2)).toBe("1 part left before Thursday");
    expect(reminderBody(0, remindAt, 2)).toBe("Every part is done. Submit it before Thursday");
  });
});

describe("isLate", () => {
  it("is late once the org clock reaches the anchor's day", () => {
    const remindAt = new Date("2025-11-11T07:00:00.000Z"); // Tue; the anchor is Thu 13 Nov
    expect(isLate(remindAt, 2, new Date("2025-11-11T07:05:00.000Z"))).toBe(false);
    expect(isLate(remindAt, 2, new Date("2025-11-12T21:59:00.000Z"))).toBe(false); // 23:59 Wed Cairo
    expect(isLate(remindAt, 2, new Date("2025-11-12T22:00:00.000Z"))).toBe(true); // 00:00 Thu Cairo
  });
});
