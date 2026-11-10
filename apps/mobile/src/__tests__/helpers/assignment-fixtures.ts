// One three-part assignment (video, essay, forum) and the student's work on it,
// as the API sends them, for the checklist and the part screens' suites.
import type { AssignmentDetail, AssignmentPart, PartWork, SubmissionDetail } from "@space/shared";

export const videoPart = {
  id: 1,
  position: 0,
  kind: "VIDEO" as const,
  title: "Luke 15 talk",
  youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  blockSkipping: false,
  durationSeconds: 1080,
  videoId: "dQw4w9WgXcQ",
};

export const essayPart = {
  id: 2,
  position: 1,
  kind: "ESSAY" as const,
  prompt: "Who are you in the story?",
  minWords: 150,
  maxWords: 300,
  maxFileSizeMb: null as number | null,
  allowedMimeCategories: [],
};

export const forumPart = {
  id: 3,
  position: 2,
  kind: "FORUM" as const,
  prompt: "Share one takeaway",
  minWords: 5,
  postToRead: true,
  allowComments: true,
};

export const PARTS: AssignmentPart[] = [videoPart, essayPart, forumPart];

export function videoWork(watchedSeconds: number, answered = 0, questionCount = 0): PartWork {
  return {
    partId: 1,
    kind: "VIDEO",
    status: watchedSeconds === 0 ? "NOT_STARTED" : "IN_PROGRESS",
    video: { watchedSeconds, durationSeconds: 1080, answered, questionCount, correct: 0 },
  };
}

export function essayWork(
  reviewStatus: "DRAFT" | "SUBMITTED" | "REVIEWED" | "RETURNED",
  wordCount: number,
  feedback: string | null = null,
): PartWork {
  return {
    partId: 2,
    kind: "ESSAY",
    status: reviewStatus === "RETURNED" ? "RETURNED" : reviewStatus === "DRAFT" ? "IN_PROGRESS" : "DONE",
    essay: { publicId: "essay00001", wordCount, reviewStatus, feedback },
  };
}

export function forumWork(posted: boolean): PartWork {
  return { partId: 3, kind: "FORUM", status: posted ? "DONE" : "NOT_STARTED", forum: { posted } };
}

/** The assignment as a student reads it; `works` is their work on each part. */
export function assignmentDetail(
  works: PartWork[],
  over: Partial<AssignmentDetail> = {},
): AssignmentDetail & Record<string, unknown> {
  return {
    id: 41,
    seasonId: 7,
    seasonCode: "S26",
    seasonTitle: "Spring 2026",
    title: "The lost son",
    description: "Watch, write, then share.",
    dueAt: "2099-04-01T21:59:00.000Z",
    dueOrgDay: "2099-04-01",
    dueOrgTime: "23:59",
    isOverdue: false,
    reminder: { enabled: true, days: 2, anchor: "NEXT_SESSION", time: "09:00" },
    reminderLine: null,
    parts: PARTS,
    my: { submittedAt: null, parts: works },
    canManage: false,
    readOnly: false,
    ...over,
  };
}

/** One essay as GET /submissions/:publicId answers it. */
export function essayDetail(
  status: "DRAFT" | "SUBMITTED" | "REVIEWED" | "RETURNED",
  text: string | null,
  over: Partial<SubmissionDetail> = {},
): SubmissionDetail {
  return {
    id: 900,
    publicId: "essay00001",
    status,
    text,
    wordCount: 0,
    partId: 2,
    prompt: essayPart.prompt,
    minWords: essayPart.minWords,
    maxWords: essayPart.maxWords,
    maxFileSizeMb: null,
    allowedMimeCategories: [],
    feedback: null,
    submittedAt: null,
    reviewedAt: null,
    isLate: false,
    assignmentId: 41,
    assignmentTitle: "The lost son",
    assignmentDueAt: null,
    assignmentDescription: null,
    seasonCode: "S26",
    studentUserId: 9,
    studentName: "Test student",
    studentEmail: "s@jpc.test",
    groupId: null,
    groupName: null,
    files: [],
    canUploadFiles: false,
    canReview: false,
    ...over,
  };
}

/** `n` words of filler. */
export const words = (n: number): string => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
