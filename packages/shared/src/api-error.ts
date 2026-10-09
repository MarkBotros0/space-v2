import { z } from "zod";

/**
 * The failure envelope every backend path returns (CLAUDE.md "Response
 * envelope"). Clients parse an error body with this instead of reaching into
 * `response.data.error.message` by cast.
 */
export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    /** Field-level messages, e.g. `code_taken`'s `{ code: "Already in use." }` (v1 season-actions.ts:76-83). */
    details: z.object({ fieldErrors: z.record(z.string(), z.string()) }).partial().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
