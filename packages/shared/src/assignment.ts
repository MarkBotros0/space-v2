import type { AssignmentType, SubmissionStatus } from "./enums";

// Wire shapes — see the note in season.ts on why timestamps are strings.

/** What GET /seasons/:id/assignments returns to staff (SUPER/ADMIN/LEADER/MENTOR). */
export interface StaffAssignmentListItem {
  id: number;
  title: string;
  dueAt: string | null;
  isAllGroups: boolean;
  submissionCount: number;
  expectedCount: number;
  seasonCode: string;
}

/** What the same endpoint returns to a STUDENT. */
export interface StudentAssignmentListItem {
  id: number;
  title: string;
  dueAt: string | null;
  status: SubmissionStatus | "PENDING";
  reviewedAt: string | null;
}

export type AssignmentListItem = StaffAssignmentListItem | StudentAssignmentListItem;

export interface MySubmissionSummary {
  publicId: string;
  status: SubmissionStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  feedback: string | null;
}

export interface AssignmentDetail {
  id: number;
  seasonId: number;
  seasonCode: string;
  seasonTitle: string;
  sessionId: number | null;
  sessionTitle: string | null;
  title: string;
  description: string | null;
  dueAt: string | null;
  isAllGroups: boolean;
  type: AssignmentType;
  forumMinWords: number | null;
  forumAllowComments: boolean;
  maxFileSizeMb: number | null;
  allowedMimeCategories: string[];
  groupIds: number[];
  /** Present only for students; null for everyone else. */
  mySubmission: MySubmissionSummary | null;
}
