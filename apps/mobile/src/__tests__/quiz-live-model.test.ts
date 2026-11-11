import type { QuizLiveRow } from "@space/shared";

import { liveRowView, liveSummary } from "../screens/quiz-live/live-model";

const NOW = Date.parse("2099-03-02T10:00:00.000Z");

const row = (over: Partial<QuizLiveRow> = {}): QuizLiveRow => ({
  studentUserId: 9,
  studentName: "Test student",
  groupName: "Group A",
  state: "not_started",
  deadlineAt: null,
  exits: 0,
  lastExitAt: null,
  ...over,
});

describe("liveSummary", () => {
  it("counts not started, in progress, finished, and anyone who left the quiz", () => {
    const rows = [
      row({ state: "not_started" }),
      row({ state: "not_started" }),
      row({ state: "in_progress", exits: 1 }),
      row({ state: "submitted" }),
      row({ state: "graded", exits: 2 }),
      row({ state: "timed_out" }),
      row({ state: "ended_by_exits", exits: 3 }),
      row({ state: "ended_by_staff" }),
    ];
    expect(liveSummary(rows)).toEqual({ notStarted: 2, inProgress: 1, finished: 5, withExits: 3 });
  });

  it("is all zeros for no students", () => {
    expect(liveSummary([])).toEqual({ notStarted: 0, inProgress: 0, finished: 0, withExits: 0 });
  });
});

describe("liveRowView", () => {
  it("not started", () => {
    expect(liveRowView(row(), 0, NOW, true)).toEqual({
      title: "Test student",
      stateChip: { tone: "neutral", label: "Not started" },
      detail: "Hasn't started",
      spoken: "Hasn't started",
    });
  });

  it("in progress, timed: the time left on the server's clock and the exits", () => {
    // 12:30 to the deadline on the server; the phone is 5 minutes behind, so the offset adds them back.
    const deadlineAt = new Date(NOW + 5 * 60_000 + 12.5 * 60_000).toISOString();
    const view = liveRowView(row({ state: "in_progress", deadlineAt, exits: 1 }), 5 * 60_000, NOW, true);
    expect(view.stateChip).toEqual({ tone: "info", label: "In progress" });
    expect(view.detail).toBe("12:30 left · 1 exit");
    // A screen reader hears whole minutes, not every second.
    expect(view.spoken).toBe("13 minutes left, 1 exit");
  });

  it("in progress past its deadline but not closed yet", () => {
    const deadlineAt = new Date(NOW - 5_000).toISOString();
    const view = liveRowView(row({ state: "in_progress", deadlineAt, exits: 1 }), 0, NOW, true);
    expect(view.detail).toBe("Time up · closing");
    expect(view.spoken).toBe("Time up, closing");
  });

  it("in progress with no exits says only the time", () => {
    const deadlineAt = new Date(NOW + 90_000).toISOString();
    expect(liveRowView(row({ state: "in_progress", deadlineAt }), 0, NOW, true).detail).toBe("1:30 left");
  });

  it("in progress, untimed", () => {
    expect(liveRowView(row({ state: "in_progress", exits: 2 }), 0, NOW, false).detail).toBe("No time limit · 2 exits");
  });

  it("in progress, timed but no deadline yet: a reopened retake not started", () => {
    expect(liveRowView(row({ state: "in_progress" }), 0, NOW, true).detail).toBe("Retake not started");
  });

  it("submitted and graded", () => {
    expect(liveRowView(row({ state: "submitted" }), 0, NOW, true)).toMatchObject({
      stateChip: { tone: "neutral", label: "Submitted" },
      detail: "No exits",
    });
    expect(liveRowView(row({ state: "graded", exits: 1 }), 0, NOW, true)).toMatchObject({
      stateChip: { tone: "ok", label: "Graded" },
      detail: "1 exit",
    });
  });

  it("timed out", () => {
    expect(liveRowView(row({ state: "timed_out" }), 0, NOW, true)).toMatchObject({
      stateChip: { tone: "warn", label: "Timed out" },
      detail: "Time ran out",
    });
    expect(liveRowView(row({ state: "timed_out", exits: 2 }), 0, NOW, true).detail).toBe("Time ran out · 2 exits");
  });

  it("ended by exits", () => {
    expect(liveRowView(row({ state: "ended_by_exits", exits: 3 }), 0, NOW, true)).toMatchObject({
      stateChip: { tone: "bad", label: "Ended" },
      detail: "Left the quiz",
    });
  });

  it("ended by staff", () => {
    expect(liveRowView(row({ state: "ended_by_staff" }), 0, NOW, true)).toMatchObject({
      stateChip: { tone: "neutral", label: "Ended" },
      detail: "Ended by staff",
    });
  });

  it("a student with no name", () => {
    expect(liveRowView(row({ studentName: null }), 0, NOW, true).title).toBe("Student");
  });
});
