import type { AssignmentPart, PartWork } from "@space/shared";

import {
  handedInEssays,
  orderProgress,
  partChips,
  progressLine,
  type ProgressRow,
} from "../screens/assignment-detail/progress-model";

const video = (id: number, durationSeconds = 1080): AssignmentPart => ({
  id,
  position: id,
  kind: "VIDEO",
  title: `Video ${id}`,
  youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
  videoId: "dQw4w9WgXcQ",
  blockSkipping: false,
  durationSeconds,
});
const essay = (id: number): AssignmentPart => ({
  id,
  position: id,
  kind: "ESSAY",
  prompt: `Question ${id}`,
  minWords: null,
  maxWords: null,
  maxFileSizeMb: null,
  allowedMimeCategories: [],
});
const forum = (id: number): AssignmentPart => ({
  id,
  position: id,
  kind: "FORUM",
  prompt: "Talk",
  minWords: null,
  postToRead: false,
  allowComments: true,
});

const watching = (partId: number, watchedSeconds: number, answered = 0, questionCount = 0, correct = 0): PartWork => ({
  partId,
  kind: "VIDEO",
  status: watchedSeconds > 0 ? "IN_PROGRESS" : "NOT_STARTED",
  video: { watchedSeconds, durationSeconds: 1080, answered, questionCount, correct },
});
const essayWork = (partId: number, reviewStatus: "SUBMITTED" | "REVIEWED" | "RETURNED", publicId = `e${partId}`) => ({
  partId,
  kind: "ESSAY" as const,
  status: reviewStatus === "RETURNED" ? ("RETURNED" as const) : ("DONE" as const),
  essay: { publicId, wordCount: 100, reviewStatus, feedback: null },
});

const labels = (parts: AssignmentPart[], works: PartWork[]) => partChips(parts, works).map((c) => c.label);

describe("partChips", () => {
  it("says how far into a video in minutes, then its questions, then its score", () => {
    const parts = [video(1)];
    expect(labels(parts, [])).toEqual(["Video: not started"]);
    expect(labels(parts, [watching(1, 360)])).toEqual(["Video 6/18 min"]);
    expect(labels(parts, [watching(1, 1000, 2, 4)])).toEqual(["Video: 2 of 4 answered"]);
    expect(labels(parts, [watching(1, 1000, 4, 4, 3)])).toEqual(["Video: 3 of 4 correct"]);
    expect(labels(parts, [watching(1, 1000)])).toEqual(["Video: watched"]);
  });

  it("numbers parts of the same kind when there is more than one", () => {
    const parts = [video(1), video(2), essay(3), essay(4), forum(5)];
    expect(labels(parts, [watching(2, 360), essayWork(4, "RETURNED")])).toEqual([
      "Video 1: not started",
      "Video 2: 6/18 min",
      "Essay 1: not handed in",
      "Essay 2: returned",
      "Forum: not posted",
    ]);
  });

  it("names every essay state in words, with a tone that matches", () => {
    const parts = [essay(1)];
    expect(partChips(parts, [essayWork(1, "SUBMITTED")])).toEqual([{ tone: "info", label: "Essay: waiting review" }]);
    expect(partChips(parts, [essayWork(1, "REVIEWED")])).toEqual([{ tone: "ok", label: "Essay: reviewed" }]);
    expect(partChips(parts, [essayWork(1, "RETURNED")])).toEqual([{ tone: "warn", label: "Essay: returned" }]);
  });

  it("follows the admin's order, not the order the works arrive in", () => {
    const parts = [forum(3), video(1)].map((p, i) => ({ ...p, position: i }));
    expect(labels(parts, [])).toEqual(["Forum: not posted", "Video: not started"]);
  });
});

const row = (name: string | null, submittedAt: string | null, parts: PartWork[], id = 1): ProgressRow => ({
  studentUserId: id,
  name,
  avatarPath: null,
  submittedAt,
  staffMark: null,
  parts,
});

describe("orderProgress and progressLine", () => {
  const parts = [video(1), essay(2)];
  const done = [watching(1, 1000), essayWork(2, "SUBMITTED")];

  it("puts students who haven't submitted, or still have parts left, before finished ones, by name", () => {
    const finished = row("Amal", "2099-03-30T10:00:00.000Z", done, 1);
    const notSubmitted = row("Zeina", null, done, 2);
    const partLeft = row("Badr", "2099-03-30T10:00:00.000Z", [watching(1, 10), essayWork(2, "SUBMITTED")], 3);
    const unnamed = row(null, null, [], 4);
    const { unfinished, finished: fin } = orderProgress(parts, [finished, notSubmitted, unnamed, partLeft]);
    expect(unfinished.map((r) => r.studentUserId)).toEqual([3, 2, 4]);
    expect(fin.map((r) => r.studentUserId)).toEqual([1]);
  });

  it("reads each row's standing in words", () => {
    expect(progressLine(parts, row("A", null, []))).toBe("2 parts left");
    expect(progressLine(parts, row("A", null, [watching(1, 1000)]))).toBe("1 part left");
    expect(progressLine(parts, row("A", null, done))).toBe("Every part done, not submitted yet");
    expect(progressLine(parts, row("A", "2099-03-30T10:00:00.000Z", done))).toMatch(/^Submitted Mar 30/);
  });
});

describe("handedInEssays", () => {
  const parts = [essay(1), essay(2), essay(3)];
  it("lists every essay handed in, in the admin's order, named as its chip", () => {
    const works = [essayWork(2, "SUBMITTED"), essayWork(1, "RETURNED"), essayWork(3, "REVIEWED")];
    expect(handedInEssays(parts, row("A", null, works))).toEqual([
      { publicId: "e1", label: "Essay 1: returned" },
      { publicId: "e2", label: "Essay 2: waiting review" },
      { publicId: "e3", label: "Essay 3: reviewed" },
    ]);
    expect(handedInEssays(parts, row("A", null, []))).toEqual([]);
  });
});

describe("the video chip agrees with partsLeft", () => {
  it("judges watched by the work's own length, as shared partDone does", () => {
    const parts = [video(1, 1080)];
    // The work has no length yet: partDone says not watched, so the chip shows minutes, not questions.
    const work: PartWork = {
      partId: 1,
      kind: "VIDEO",
      status: "IN_PROGRESS",
      video: { watchedSeconds: 1000, durationSeconds: 0, answered: 0, questionCount: 2, correct: 0 },
    };
    expect(labels(parts, [work])).toEqual(["Video 16/18 min"]);
    expect(progressLine(parts, row("A", null, [work]))).toBe("1 part left");
  });
});
