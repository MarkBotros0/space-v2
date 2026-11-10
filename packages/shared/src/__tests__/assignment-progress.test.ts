import {
  canSubmit,
  essayWordCount,
  partDone,
  isWatched,
  mergeIntervals,
  partsLeft,
  submitBlockerLine,
  watchedSeconds,
  wordRangeIssue,
  type AssignmentPart,
  type PartWork,
} from "../index";

const parts: AssignmentPart[] = [
  {
    id: 1,
    position: 0,
    kind: "VIDEO",
    title: "Luke 15 talk",
    youtubeUrl: "dQw4w9WgXcQ",
    blockSkipping: true,
    durationSeconds: 1080,
    videoId: "dQw4w9WgXcQ",
  },
  {
    id: 2,
    position: 1,
    kind: "ESSAY",
    prompt: "Reflect",
    minWords: 3,
    maxWords: 10,
    maxFileSizeMb: null,
    allowedMimeCategories: [],
  },
  { id: 3, position: 2, kind: "FORUM", prompt: "Discuss", minWords: null, postToRead: true, allowComments: false },
];

const video = (watchedSeconds: number, answered = 2): PartWork => ({
  partId: 1,
  kind: "VIDEO",
  status: "IN_PROGRESS",
  video: { watchedSeconds, durationSeconds: 1080, answered, questionCount: 2, correct: 1 },
});
const essay = (wordCount: number): PartWork => ({
  partId: 2,
  kind: "ESSAY",
  status: "IN_PROGRESS",
  essay: { publicId: "e", wordCount, reviewStatus: "DRAFT", feedback: null },
});
const forum = (posted: boolean): PartWork => ({ partId: 3, kind: "FORUM", status: "NOT_STARTED", forum: { posted } });

it("mergeIntervals joins overlaps and touching ranges and keeps order", () => {
  expect(
    mergeIntervals(
      [[0, 60]],
      [
        [50, 120],
        [300, 320],
        [120, 130],
      ],
    ),
  ).toEqual([
    [0, 130],
    [300, 320],
  ]);
});
it("mergeIntervals clamps negatives to zero", () => {
  expect(mergeIntervals([[-5, 10]], [])).toEqual([[0, 10]]);
});
it("overlapping and repeated ranges count once", () => {
  expect(
    watchedSeconds(
      mergeIntervals(
        [[0, 100]],
        [
          [0, 100],
          [90, 100],
        ],
      ),
    ),
  ).toBe(100);
});
it("isWatched needs 90%", () => {
  expect(isWatched(971, 1080)).toBe(false);
  expect(isWatched(972, 1080)).toBe(true);
  expect(isWatched(0, 0)).toBe(false);
});
it("wordRangeIssue counts like the server", () => {
  expect(wordRangeIssue("one  two\nthree", 4, null)).toEqual({ kind: "short", by: 1 });
  expect(wordRangeIssue("a b c d e", null, 3)).toEqual({ kind: "long", by: 2 });
  expect(wordRangeIssue("a b c", 3, 3)).toBeNull();
});
it("canSubmit is false while a video is short of 90%, true when every part is done", () => {
  const works = [video(500), essay(5), forum(true)];
  expect(canSubmit(parts, works)).toBe(false);
  expect(partsLeft(parts, works)).toBe(1);
  expect(canSubmit(parts, [video(972), essay(5), forum(true)])).toBe(true);
});
it("an unanswered question, a short essay, a missing forum post and no parts all block", () => {
  expect(canSubmit(parts, [video(972, 1), essay(5), forum(true)])).toBe(false);
  expect(canSubmit(parts, [video(972), essay(2), forum(true)])).toBe(false);
  expect(canSubmit(parts, [video(972), essay(5), forum(false)])).toBe(false);
  expect(canSubmit([], [])).toBe(false);
});
it("submitBlockerLine names what is left", () => {
  expect(submitBlockerLine(parts, [video(252), essay(5), forum(false)])).toBe(
    "Finish Luke 15 talk (12 min left) and the forum post to submit",
  );
  expect(submitBlockerLine(parts, [video(972), essay(5), forum(true)])).toBeNull();
});
it("submitBlockerLine joins three with commas and numbers several essays", () => {
  expect(submitBlockerLine(parts, [])).toBe(
    "Finish Luke 15 talk (17 min left), the essay and the forum post to submit",
  );
  const two: AssignmentPart[] = [parts[1]!, { ...parts[1]!, id: 4, position: 1 } as AssignmentPart];
  expect(submitBlockerLine(two, [])).toBe("Finish the essay 1 and the essay 2 to submit");
});

describe("partDone for an essay", () => {
  const part = parts[1]!;
  const at = (reviewStatus: "DRAFT" | "SUBMITTED" | "REVIEWED" | "RETURNED", wordCount: number): PartWork => ({
    partId: 2,
    kind: "ESSAY",
    status: "IN_PROGRESS",
    essay: { publicId: "e", wordCount, reviewStatus, feedback: null },
  });

  it("a returned essay is not done, even inside the range", () => {
    expect(partDone(part, at("RETURNED", 5))).toBe(false);
  });

  it("a draft inside the range is done, so Submit can unlock", () => {
    expect(partDone(part, at("DRAFT", 5))).toBe(true);
  });

  it("a draft outside the range is not done", () => {
    expect(partDone(part, at("DRAFT", 2))).toBe(false);
    expect(partDone(part, at("DRAFT", 11))).toBe(false);
  });

  it("a handed-in or reviewed essay inside the range is done", () => {
    expect(partDone(part, at("SUBMITTED", 5))).toBe(true);
    expect(partDone(part, at("REVIEWED", 5))).toBe(true);
  });
});

describe("essayWordCount", () => {
  it("counts the plain text the app shows, not the stored markup", () => {
    expect(essayWordCount("un<i>believ</i>able")).toBe(1);
    expect(essayWordCount("it&apos;s fine")).toBe(2);
    expect(essayWordCount("Tom &amp; Jerry")).toBe(3);
    expect(essayWordCount("<p>one</p><p>two</p>")).toBe(2);
    expect(essayWordCount("a&nbsp;b")).toBe(2);
  });

  it("is zero for no text at all", () => {
    expect(essayWordCount(null)).toBe(0);
    expect(essayWordCount("  <p></p> ")).toBe(0);
  });

  it("is the count wordRangeIssue checks", () => {
    expect(wordRangeIssue("Tom &amp; Jerry", 3, null)).toBeNull();
    expect(wordRangeIssue("un<i>believ</i>able", 2, null)).toEqual({ kind: "short", by: 1 });
  });
});
