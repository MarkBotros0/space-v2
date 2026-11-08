// packages/shared/src/announcement.ts
import { z } from "zod";

import { announcementAudienceSchema } from "./enums";

export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_BODY_MAX = 5000;
export const ANNOUNCEMENT_EXCERPT_LENGTH = 280;
export const ANNOUNCEMENT_PUSH_LENGTH = 120;
export const ANNOUNCEMENT_UNREAD_DAYS = 30;
export const ANNOUNCEMENT_PAGE_SIZE = 20;

// Wire shapes: timestamps are strings. Bodies are plain text, never HTML.

export const announcementListItemSchema = z.object({
  id: z.number().int(),
  audience: announcementAudienceSchema,
  seasonId: z.number().int().nullable(),
  seasonTitle: z.string().nullable(),
  title: z.string(),
  excerpt: z.string(),
  /** Null once the author's account is gone ("Former member"). */
  authorName: z.string().nullable(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  isRead: z.boolean(),
});
export type AnnouncementListItem = z.infer<typeof announcementListItemSchema>;

export const announcementDetailSchema = announcementListItemSchema.omit({ excerpt: true }).extend({
  body: z.string(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  seasonFinished: z.boolean(),
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

const titleField = z.string().trim().min(1).max(ANNOUNCEMENT_TITLE_MAX);
const bodyField = z.string().trim().min(1).max(ANNOUNCEMENT_BODY_MAX);

export const createAnnouncementRequestSchema = z.discriminatedUnion("audience", [
  z.object({ audience: z.literal("COMMUNITY"), title: titleField, body: bodyField }).strict(),
  z
    .object({
      audience: z.literal("SEASON"),
      seasonId: z.number().int().positive(),
      title: titleField,
      body: bodyField,
    })
    .strict(),
]);
export type CreateAnnouncementRequest = z.infer<typeof createAnnouncementRequestSchema>;

export const updateAnnouncementRequestSchema = z
  .object({ title: titleField.optional(), body: bodyField.optional() })
  .strict()
  .refine((v) => v.title !== undefined || v.body !== undefined, {
    message: "Provide a title or a body",
  });
export type UpdateAnnouncementRequest = z.infer<typeof updateAnnouncementRequestSchema>;
