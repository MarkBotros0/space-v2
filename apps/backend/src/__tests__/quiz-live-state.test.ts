import { liveState } from "../lib/quizzes/live-state";
import { sortLiveRows } from "../lib/quizzes/live-view";

describe("liveState", () => {
  it.each([
    [null, "not_started"],
    [{ status: "IN_PROGRESS", endReason: null }, "in_progress"],
    [{ status: "SUBMITTED", endReason: "SUBMITTED" }, "submitted"],
    [{ status: "GRADED", endReason: "SUBMITTED" }, "graded"],
    [{ status: "SUBMITTED", endReason: "TIMED_OUT" }, "timed_out"],
    [{ status: "GRADED", endReason: "TIMED_OUT" }, "timed_out"],
    [{ status: "SUBMITTED", endReason: "ENDED_BY_EXITS" }, "ended_by_exits"],
    [{ status: "GRADED", endReason: "ENDED_BY_EXITS" }, "ended_by_exits"],
    [{ status: "SUBMITTED", endReason: "ENDED_BY_STAFF" }, "ended_by_staff"],
    [{ status: "GRADED", endReason: "ENDED_BY_STAFF" }, "ended_by_staff"],
    [{ status: "SUBMITTED", endReason: null }, "submitted"],
    [{ status: "GRADED", endReason: null }, "graded"],
  ] as const)("%j -> %s", (attempt, state) => {
    expect(liveState(attempt as Parameters<typeof liveState>[0])).toBe(state);
  });
});

describe("sortLiveRows", () => {
  const row = (name: string, state: "in_progress" | "not_started" | "graded", exits = 0) => ({
    studentUserId: 1,
    studentName: name,
    groupName: null,
    state,
    deadlineAt: null,
    exits,
    lastExitAt: null,
  });
  it("open with exits, open, not started, then finished, each by name", () => {
    const sorted = sortLiveRows([
      row("A", "graded"),
      row("B", "not_started"),
      row("C", "in_progress"),
      row("E", "in_progress", 2),
      row("D", "in_progress", 1),
      row("Z", "graded"),
    ]);
    expect(sorted.map((r) => r.studentName)).toEqual(["D", "E", "C", "B", "A", "Z"]);
  });
});
