import type { AssignmentPart, PartWork } from "@space/shared";

import { MIME_CATEGORY_LABELS, partKindLabel, partStatusLine } from "../lib/assignment-labels";

const video: AssignmentPart = {
  id: 1,
  position: 0,
  kind: "VIDEO",
  title: "Luke 15 talk",
  youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
  videoId: "dQw4w9WgXcQ",
  blockSkipping: false,
  durationSeconds: 18 * 60,
};
const essay: AssignmentPart = {
  id: 2,
  position: 1,
  kind: "ESSAY",
  prompt: "What did the father do?",
  minWords: 100,
  maxWords: 300,
  maxFileSizeMb: null,
  allowedMimeCategories: [],
};
const forum: AssignmentPart = {
  id: 3,
  position: 2,
  kind: "FORUM",
  prompt: "Discuss",
  minWords: null,
  postToRead: true,
  allowComments: true,
};

const videoWork = (watchedSeconds: number, answered = 0, questionCount = 0): PartWork => ({
  partId: 1,
  kind: "VIDEO",
  status: "IN_PROGRESS",
  video: { watchedSeconds, durationSeconds: 18 * 60, answered, questionCount, correct: 0 },
});
const essayWork = (reviewStatus: "DRAFT" | "SUBMITTED" | "REVIEWED" | "RETURNED", wordCount = 120): PartWork => ({
  partId: 2,
  kind: "ESSAY",
  status: reviewStatus === "RETURNED" ? "RETURNED" : "IN_PROGRESS",
  essay: { publicId: "e1", wordCount, reviewStatus, feedback: null },
});

describe("partKindLabel", () => {
  it("names each kind", () => {
    expect(partKindLabel("VIDEO")).toBe("Video");
    expect(partKindLabel("ESSAY")).toBe("Essay");
    expect(partKindLabel("FORUM")).toBe("Forum");
  });
});

describe("partStatusLine", () => {
  it("says Watched 6 of 18 min / Draft, 120 words / Returned — needs changes / Posted / Not started", () => {
    expect(partStatusLine(video, videoWork(6 * 60 + 20))).toBe("Watched 6 of 18 min");
    expect(partStatusLine(essay, essayWork("DRAFT"))).toBe("Draft, 120 words");
    expect(partStatusLine(essay, essayWork("RETURNED"))).toBe("Returned — needs changes");
    expect(partStatusLine(forum, { partId: 3, kind: "FORUM", status: "DONE", forum: { posted: true } })).toBe("Posted");
    expect(partStatusLine(video, undefined)).toBe("Not started");
    expect(partStatusLine(essay, undefined)).toBe("Not started");
  });

  it("words a watched video, and the questions still open on it", () => {
    expect(partStatusLine(video, videoWork(17 * 60))).toBe("Watched");
    expect(partStatusLine(video, videoWork(17 * 60, 2, 3))).toBe("Watched, 2 of 3 questions answered");
    expect(partStatusLine(video, videoWork(17 * 60, 3, 3))).toBe("Watched");
    expect(partStatusLine(video, { ...videoWork(0), status: "NOT_STARTED" })).toBe("Not started");
  });

  it("words a handed-in, a reviewed and an empty essay", () => {
    expect(partStatusLine(essay, essayWork("SUBMITTED"))).toBe("Handed in");
    expect(partStatusLine(essay, essayWork("REVIEWED"))).toBe("Reviewed");
    expect(partStatusLine(essay, essayWork("DRAFT", 1))).toBe("Draft, 1 word");
    expect(partStatusLine(essay, essayWork("DRAFT", 0))).toBe("Not started");
  });

  it("says Not posted for a forum with no post yet", () => {
    expect(partStatusLine(forum, undefined)).toBe("Not posted");
    expect(partStatusLine(forum, { partId: 3, kind: "FORUM", status: "NOT_STARTED", forum: { posted: false } })).toBe(
      "Not posted",
    );
  });
});

describe("MIME_CATEGORY_LABELS", () => {
  it("keeps v1's labels", () => expect(MIME_CATEGORY_LABELS.doc).toBe("Documents (Word, ODF)"));
});
