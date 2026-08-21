import { z } from "zod";

import type { SubmissionStatus } from "./enums";

export const updateSubmissionRequestSchema = z.object({
  text: z.string(),
  /** Omitted or false saves a draft; true submits and stamps submittedAt. */
  submit: z.boolean().optional(),
});
export type UpdateSubmissionRequest = z.infer<typeof updateSubmissionRequestSchema>;

// Wire shapes — see the note in season.ts on why timestamps are strings.

export interface SubmissionFileSummary {
  id: number;
  originalName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}

export interface SubmissionDetail {
  id: number;
  publicId: string;
  status: SubmissionStatus;
  text: string | null;
  feedback: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  assignmentId: number;
  assignmentTitle: string;
  assignmentDueAt: string | null;
  assignmentDescription: string | null;
  seasonCode: string;
  studentUserId: number;
  studentName: string | null;
  studentEmail: string;
  files: SubmissionFileSummary[];
}
