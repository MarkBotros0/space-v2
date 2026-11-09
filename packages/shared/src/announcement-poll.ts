// packages/shared/src/announcement-poll.ts
import { z } from "zod";

export const POLL_OPTIONS_MIN = 2;
export const POLL_OPTIONS_MAX = 10;
export const POLL_OPTION_MAX = 150;

const pollOptionInputSchema = z.object({
  /** Present on an edit to keep an existing option (and its votes); absent for a new one. */
  id: z.number().int().positive().optional(),
  label: z.string().trim().min(1).max(POLL_OPTION_MAX),
});

const optionsField = z
  .array(pollOptionInputSchema)
  .min(POLL_OPTIONS_MIN)
  .max(POLL_OPTIONS_MAX)
  .superRefine((options, ctx) => {
    const seen = new Set<string>();
    options.forEach((option, i) => {
      const key = option.label.trim().toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: "Each option must be different",
          path: [i, "label"],
        });
      }
      seen.add(key);
    });
  });

export const pollInputSchema = z
  .object({ allowsMultiple: z.boolean(), options: optionsField })
  .strict();
export type PollInput = z.infer<typeof pollInputSchema>;

/** A new post has no options to keep, so an `id` is refused. */
export const pollInputWithoutIdsSchema = pollInputSchema.refine(
  (poll) => poll.options.every((option) => option.id === undefined),
  { message: "A new poll's options carry no id", path: ["options"] },
);

export const announcementPollSchema = z.object({
  version: z.number().int().positive(),
  allowsMultiple: z.boolean(),
  closed: z.boolean(),
  canVote: z.boolean(),
  canManage: z.boolean(),
  /** Who voted for what: managers, and a Super once the season has finished. */
  canSeeNames: z.boolean(),
  myOptionIds: z.array(z.number().int()),
  /** Null while the caller may not see counts (before they vote, unless a manager). */
  voterCount: z.number().int().nullable(),
  /** Managers only: people with more than one pick. */
  multiPickVoters: z.number().int().nullable(),
  /** Managers only: the vote rows of those people, what a several -> one edit removes. */
  multiPickVotes: z.number().int().nullable(),
  options: z.array(
    z.object({
      id: z.number().int(),
      label: z.string(),
      votes: z.number().int().nullable(),
    }),
  ),
});
export type AnnouncementPoll = z.infer<typeof announcementPollSchema>;

export const pollVoteRequestSchema = z
  .object({
    version: z.number().int().positive(),
    optionIds: z.array(z.number().int().positive()).min(1),
  })
  .strict();
export type PollVoteRequest = z.infer<typeof pollVoteRequestSchema>;

export const pollVotersResponseSchema = z.object({
  options: z.array(
    z.object({
      id: z.number().int(),
      label: z.string(),
      voters: z.array(z.object({ name: z.string().nullable() })),
    }),
  ),
});
export type PollVotersResponse = z.infer<typeof pollVotersResponseSchema>;

/** Extra field on the 409 `poll_votes_lost` body. */
export const pollVotesLostSchema = z.object({ votes: z.number().int().min(0) });
