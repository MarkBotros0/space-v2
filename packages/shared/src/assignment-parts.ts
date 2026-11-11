import { z } from "zod";

import { assignmentPartKindSchema } from "./enums";
import { parseYouTubeId } from "./youtube";

// An assignment is a list of parts: Video, Essay and Forum. Each part has an
// input shape (what an author sends, `id` present when editing an existing
// part) and a stored shape (what a reader gets back: `id` and `position`).

/**
 * The six MIME buckets an essay may restrict uploads to. An empty array means
 * "any type" — there is no "all" member.
 */
const mimeCategorySchema = z.enum(["image", "pdf", "doc", "audio", "video", "text"]);
export type MimeCategory = z.infer<typeof mimeCategorySchema>;

/** Longest video an author may declare: 12 hours. */
export const MAX_PART_VIDEO_SECONDS = 43_200;

const wordLimit = z.number().int().min(1).max(5000);

const videoFields = {
  kind: z.literal("VIDEO"),
  title: z.string().trim().min(1).max(200),
  youtubeUrl: z.string().refine((v) => parseYouTubeId(v) !== null, "That isn't a YouTube link"),
  blockSkipping: z.boolean(),
  durationSeconds: z.number().int().min(1).max(MAX_PART_VIDEO_SECONDS),
};

const essayFields = {
  kind: z.literal("ESSAY"),
  prompt: z.string().trim().min(1).max(2000),
  minWords: wordLimit.nullable(),
  maxWords: wordLimit.nullable(),
  maxFileSizeMb: z.number().int().min(1).max(100).nullable(),
  allowedMimeCategories: z.array(mimeCategorySchema),
};

const forumFields = {
  kind: z.literal("FORUM"),
  prompt: z.string().trim().min(1).max(2000),
  minWords: wordLimit.nullable(),
  postToRead: z.boolean(),
  allowComments: z.boolean(),
};

const essayRange = (v: { minWords: number | null; maxWords: number | null }) =>
  v.minWords === null || v.maxWords === null || v.minWords <= v.maxWords;
const essayRangeIssue = { message: "The minimum is more than the maximum", path: ["minWords"] };

const optionalId = { id: z.number().int().positive().optional() };

export const assignmentPartInputSchema = z.discriminatedUnion("kind", [
  z.object({ ...optionalId, ...videoFields }),
  z.object({ ...optionalId, ...essayFields }).refine(essayRange, essayRangeIssue),
  z.object({ ...optionalId, ...forumFields }),
]);
export type AssignmentPartInput = z.input<typeof assignmentPartInputSchema>;

const stored = { id: z.number(), position: z.number() };

/** A part as a reader sees it. A video also carries its YouTube id. */
export const assignmentPartSchema = z.discriminatedUnion("kind", [
  z.object({ ...stored, ...videoFields, videoId: z.string().nullable() }),
  z.object({ ...stored, ...essayFields }),
  z.object({ ...stored, ...forumFields }),
]);
export type AssignmentPart = z.infer<typeof assignmentPartSchema>;

const partWorkStatusSchema = z.enum(["NOT_STARTED", "IN_PROGRESS", "DONE", "RETURNED"]);

/** One student's work on one part, for the student and for the leader. */
export const partWorkSchema = z.object({
  partId: z.number(),
  kind: assignmentPartKindSchema,
  status: partWorkStatusSchema,
  essay: z
    .object({
      publicId: z.string(),
      wordCount: z.number(),
      reviewStatus: z.enum(["DRAFT", "SUBMITTED", "REVIEWED", "RETURNED"]),
      feedback: z.string().nullable(),
    })
    .optional(),
  video: z
    .object({
      watchedSeconds: z.number(),
      durationSeconds: z.number(),
      answered: z.number(),
      questionCount: z.number(),
      correct: z.number(),
    })
    .optional(),
  forum: z.object({ posted: z.boolean() }).optional(),
});
export type PartWork = z.infer<typeof partWorkSchema>;
