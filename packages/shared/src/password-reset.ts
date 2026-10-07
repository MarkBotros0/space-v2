import { z } from "zod";

import { passwordSchema } from "./user";

/** v1's hard-coded TTL (spec 11 R73), stated once for the API and the copy. */
export const PASSWORD_RESET_TTL_MINUTES = 60;

/**
 * strict(): the anonymous endpoints take exactly what they need. The email is
 * trimmed but NOT lower-cased — login matches the stored address exactly
 * (lib/auth/credentials.ts), and a reset must find the same row login would.
 */
export const forgotPasswordRequestSchema = z
  .object({ email: z.string().trim().email("Must be a valid email.") })
  .strict();
export type ForgotPasswordBody = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z
  .object({
    token: z.string().trim().min(16, "Paste the code from your email.").max(256),
    password: passwordSchema,
  })
  .strict();
export type ResetPasswordBody = z.infer<typeof resetPasswordRequestSchema>;

/** Both endpoints answer `{ ok: true }` — forgot-password on every path (R67). */
export const passwordResetAckSchema = z.object({ ok: z.literal(true) });
export type PasswordResetAck = z.infer<typeof passwordResetAckSchema>;

/**
 * Accepts what a person actually pastes: the bare code, v2's
 * `spacev2://reset-password?token=…` link, or a v1 web link
 * `https://…/reset-password?token=…` (same token format — Plan 10 Decision 10).
 */
export function extractResetToken(input: string): string {
  const trimmed = input.trim();
  const match = /[?&#]token=([^&#\s]+)/.exec(trimmed);
  if (!match?.[1]) return trimmed;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
