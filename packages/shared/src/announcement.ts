// packages/shared/src/announcement.ts
import { z } from "zod";

import { announcementAudienceSchema } from "./enums";
import { htmlToPlainText } from "./html-text";
import { announcementPollSchema, pollInputSchema, pollInputWithoutIdsSchema } from "./announcement-poll";

/** The message's length as read (its words, not its formatting). */
export const ANNOUNCEMENT_BODY_MAX = 5000;
/** The stored body with its formatting tags: room for the markup around 5000 characters of text. */
const ANNOUNCEMENT_BODY_STORED_MAX = 20000;
export const ANNOUNCEMENT_EXCERPT_LENGTH = 280;
export const ANNOUNCEMENT_PUSH_LENGTH = 120;
export const ANNOUNCEMENT_UNREAD_DAYS = 30;
export const ANNOUNCEMENT_PAGE_SIZE = 20;

// Wire shapes: timestamps are strings. Bodies are plain text, never HTML.

const announcementListItemSchema = z.object({
  id: z.number().int(),
  audience: announcementAudienceSchema,
  seasonId: z.number().int().nullable(),
  seasonTitle: z.string().nullable(),
  excerpt: z.string(),
  /** Null once the author's account is gone ("Former member"). */
  authorName: z.string().nullable(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  isRead: z.boolean(),
  hasPoll: z.boolean(),
  /** Null when the post has no poll. */
  pollClosed: z.boolean().nullable(),
});
export type AnnouncementListItem = z.infer<typeof announcementListItemSchema>;

export const announcementDetailSchema = announcementListItemSchema.omit({ excerpt: true }).extend({
  body: z.string(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  seasonFinished: z.boolean(),
  poll: announcementPollSchema.nullable(),
});
export type AnnouncementDetail = z.infer<typeof announcementDetailSchema>;

export const announcementPageResponseSchema = z.object({
  items: z.array(announcementListItemSchema),
  nextCursor: z.string().nullable(),
});
export type AnnouncementPageResponse = z.infer<typeof announcementPageResponseSchema>;

export const announcementUnreadResponseSchema = z.object({
  count: z.number().int().min(0),
  latest: announcementListItemSchema.nullable(),
});
export type AnnouncementUnreadResponse = z.infer<typeof announcementUnreadResponseSchema>;

export const announcementTargetsResponseSchema = z.object({
  community: z.boolean(),
  communityReach: z.number().int().min(0),
  seasons: z.array(
    z.object({
      id: z.number().int(),
      code: z.string(),
      title: z.string(),
      reach: z.number().int().min(0),
    }),
  ),
});
export type AnnouncementTargetsResponse = z.infer<typeof announcementTargetsResponseSchema>;

/**
 * A body written in the rich editor (owner 2026-11-14: as an assignment's instructions, with the
 * text helpers) is HTML and starts with a tag; a post from before is plain text.
 */
export function isHtmlBody(body: string): boolean {
  return /^\s*</.test(body);
}

/** What a body says, without formatting: for the list's excerpt, a push, and the length limit. */
export function announcementPlainText(body: string): string {
  return isHtmlBody(body) ? htmlToPlainText(body) : body.trim();
}

const bodyField = z
  .string()
  .trim()
  .max(ANNOUNCEMENT_BODY_STORED_MAX)
  .refine((b) => {
    const text = announcementPlainText(b);
    return text.length >= 1 && text.length <= ANNOUNCEMENT_BODY_MAX;
  }, `Enter a message (up to ${ANNOUNCEMENT_BODY_MAX} characters).`);

export const createAnnouncementRequestSchema = z.discriminatedUnion("audience", [
  z
    .object({
      audience: z.literal("COMMUNITY"),
      body: bodyField,
      poll: pollInputWithoutIdsSchema.optional(),
    })
    .strict(),
  z
    .object({
      audience: z.literal("SEASON"),
      seasonId: z.number().int().positive(),
      body: bodyField,
      poll: pollInputWithoutIdsSchema.optional(),
    })
    .strict(),
]);
export type CreateAnnouncementRequest = z.infer<typeof createAnnouncementRequestSchema>;

export const updateAnnouncementRequestSchema = z
  .object({
    body: bodyField,
    /** Absent leaves the poll alone; null removes it. */
    poll: pollInputSchema.nullable().optional(),
    confirmVoteLoss: z.boolean().optional(),
  })
  .strict();
export type UpdateAnnouncementRequest = z.infer<typeof updateAnnouncementRequestSchema>;
